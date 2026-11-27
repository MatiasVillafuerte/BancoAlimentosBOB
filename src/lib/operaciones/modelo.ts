import { ObjectId, type Document } from "mongodb";
import type { UsuarioPublico } from "../auth/types";

export type TipoOperacion = "donaciones" | "entregas";
export type TipoConsulta = TipoOperacion | "alertas";
export const TAMANO_PAGINA = 20;
export const ESTADOS = {
  donaciones: ["por_documentar", "recibida", "observada", "completada"],
  entregas: ["programada", "por_documentar", "entregada", "observada", "completada", "cancelada"]
} as const;
export const GRUPOS = ["por_documentar", "por_revisar", "observada"] as const;
export const ETIQUETAS: Record<string, string> = {
  programada: "Programada", por_documentar: "Por documentar", recibida: "Recibida · por revisar",
  entregada: "Entregada · por revisar", observada: "Con observaciones", completada: "Completada",
  cancelada: "Cancelada", por_revisar: "Pendientes de revisión"
};
export const ZONAS: Record<string, string> = { Z1: "Z1 · Secos", Z2: "Z2 · Panificados", Z3: "Z3 · Refrigerados", Z4: "Z4 · No alimentos" };

export class ErrorConsulta extends Error {}
export interface FiltrosConsulta { q: string; estado: string; grupo: string; pagina: number }
export function leerFiltros(params: URLSearchParams, tipo: TipoConsulta): FiltrosConsulta {
  const permitidos = ["q", "pagina", tipo === "alertas" ? "grupo" : "estado"];
  for (const key of params.keys()) {
    if (!permitidos.includes(key) || params.getAll(key).length !== 1) throw new ErrorConsulta("Los filtros enviados no son válidos.");
  }
  const q = (params.get("q") || "").trim();
  const estado = params.get("estado") || "";
  const grupo = params.get("grupo") || "";
  const pagina = params.get("pagina") || "1";
  if (q.length > 80) throw new ErrorConsulta("La búsqueda admite hasta 80 caracteres.");
  if (!/^[1-9]\d{0,3}$/.test(pagina) || Number(pagina) > 1000) throw new ErrorConsulta("El número de página no es válido.");
  if (tipo !== "alertas" && estado && !(ESTADOS[tipo] as readonly string[]).includes(estado)) throw new ErrorConsulta("El estado seleccionado no es válido.");
  if (grupo && !(GRUPOS as readonly string[]).includes(grupo)) throw new ErrorConsulta("El grupo de alertas no es válido.");
  return { q, estado, grupo, pagina: Number(pagina) };
}

export function alcanceOperaciones(usuario: UsuarioPublico, tipo: TipoOperacion = "donaciones"): Document {
  if (tipo === "entregas") return usuario.rol !== "voluntario" ? {} : { $or: [
    { registradaPor: new ObjectId(usuario.id) }, { responsablePrevistoId: new ObjectId(usuario.id) },
    { entregadaPor: new ObjectId(usuario.id), fechaEntrega: { $type: "date" } }
  ] };
  return usuario.rol === "administrador" ? {} : { registradaPor: new ObjectId(usuario.id) };
}
export function filtroOperacion(usuario: UsuarioPublico, tipo: TipoOperacion, filtros: FiltrosConsulta, alerta = false): Document {
  const filtro: Document = alcanceOperaciones(usuario, tipo);
  if (alerta) {
    const revision = tipo === "donaciones" ? "recibida" : "entregada";
    filtro.estado = filtros.grupo === "por_revisar" ? revision : filtros.grupo || { $in: ["por_documentar", revision, "observada"] };
  } else if (filtros.estado) filtro.estado = filtros.estado;
  if (filtros.q) {
    const literal = filtros.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const busqueda = [{ codigo: { $regex: literal, $options: "i" } },
      { [tipo === "donaciones" ? "donante.nombre" : "organizacion.nombre"]: { $regex: literal, $options: "i" } }];
    if (filtro.$or) filtro.$and = [{ $or: busqueda }]; else filtro.$or = busqueda;
  }
  return filtro;
}

export const PROYECCION_OPERACION = {
  _id: 1, codigo: 1, estado: 1, "donante.donanteId": 1, "donante.nombre": 1,
  "organizacion.organizacionId": 1, "organizacion.nombre": 1, registradaPor: 1, registradaEn: 1,
  fechaRecepcion: 1, fechaProgramada: 1, fechaEntrega: 1, convenioId: 1, archivos: 1,
  observaciones: 1, versionDatos: 1, revision: 1, historial: 1, "migracionV2.fecha": 1,
  responsablePrevistoId: 1, entregadaPor: 1, recibidoPor: 1, lugar: 1,
  beneficiariosPrevistos: 1, beneficiariosAtendidos: 1, pesoTotalKg: 1, items: 1, requiereReasignacion: 1
};
export const PROYECCION_PERSONA = { _id: 1, nombre: 1, email: 1, telefono: 1, rol: 1, activo: 1 };
export const PROYECCION_LOTE = {
  _id: 1, codigo: 1, producto: 1, categoria: 1, cantidad: 1, unidad: 1,
  cantidadEnBodega: 1, cantidadReservada: 1, pesoKg: 1, fechaVencimiento: 1, estado: 1,
  zona: 1, conservacion: 1, atributos: 1
};

export function pipelineListado(usuario: UsuarioPublico, tipo: TipoConsulta, filtros: FiltrosConsulta): Document[] {
  function origen(coleccion: TipoOperacion): Document[] {
    return [
      { $match: filtroOperacion(usuario, coleccion, filtros, tipo === "alertas") },
      { $project: { _id: 1, codigo: 1, estado: 1, registradaPor: 1, requiereReasignacion: 1, fechaProgramada: 1,
        contraparte: coleccion === "donaciones" ? "$donante.nombre" : "$organizacion.nombre",
        tipo: { $literal: coleccion },
        fecha: coleccion === "donaciones" ? "$fechaRecepcion" : { $ifNull: ["$fechaEntrega", "$fechaProgramada"] }
      } }
    ];
  }
  const etapas = origen(tipo === "alertas" ? "donaciones" : tipo);
  if (tipo === "alertas") etapas.push({ $unionWith: { coll: "entregas", pipeline: origen("entregas") } });
  etapas.push({ $facet: {
    registros: [{ $sort: { fecha: -1, codigo: 1, _id: 1 } }, { $skip: (filtros.pagina - 1) * TAMANO_PAGINA }, { $limit: TAMANO_PAGINA }],
    total: [{ $count: "cantidad" }]
  } });
  return etapas;
}

export function idTexto(valor: unknown): string | null { return valor instanceof ObjectId ? valor.toHexString() : null; }
function texto(valor: unknown): string | null { return typeof valor === "string" && valor.length > 0 ? valor : null; }
function numero(valor: unknown): number | null { return typeof valor === "number" && Number.isFinite(valor) ? valor : null; }
function fecha(valor: unknown): string | null { return valor instanceof Date && Number.isFinite(valor.getTime()) ? valor.toISOString() : null; }
function objetos(valor: unknown): Document[] { return Array.isArray(valor) ? valor.filter(v => v && typeof v === "object") : []; }

export function personaPublica(persona: Document | null | undefined) {
  return persona ? { id: idTexto(persona._id), nombre: texto(persona.nombre), email: texto(persona.email),
    telefono: texto(persona.telefono), rol: texto(persona.rol), activo: persona.activo === true } : null;
}
export type PersonaVista = ReturnType<typeof personaPublica>;
export function filaPublica(registro: Document, personas: Map<string, Document>) {
  const autor = personas.get(idTexto(registro.registradaPor) || "");
  return { id: idTexto(registro._id)!, tipo: registro.tipo as TipoOperacion, codigo: texto(registro.codigo) || "Sin código",
    estado: texto(registro.estado) || "", contraparte: texto(registro.contraparte) || "Sin registro", fecha: fecha(registro.fecha),
    autor: autor ? { id: idTexto(autor._id), nombre: texto(autor.nombre) } : null,
    autorReferenciado: Boolean(idTexto(registro.registradaPor)), requiereReasignacion: registro.requiereReasignacion === true,
    atrasada: registro.estado === "programada" && registro.fechaProgramada instanceof Date && registro.fechaProgramada < new Date() };
}
export type FilaOperacion = ReturnType<typeof filaPublica>;

export interface ReferenciasFicha {
  personas: Map<string, Document>; lotes: Document[]; contraparte: Document | null;
  convenio: Document | null; archivos: Document[]; salidas?: Document[];
}
export function fichaPublica(registro: Document, tipo: TipoOperacion, refs: ReferenciasFicha) {
  const persona = (id: unknown) => personaPublica(refs.personas.get(idTexto(id) || ""));
  const lotes = refs.lotes.map(l => ({ id: idTexto(l._id)!, codigo: texto(l.codigo), producto: texto(l.producto),
    categoria: texto(l.categoria), cantidadRecibida: numero(l.cantidad), unidad: texto(l.unidad),
    enBodega: numero(l.cantidadEnBodega), reservada: numero(l.cantidadReservada),
    libre: numero(l.cantidadEnBodega) !== null && numero(l.cantidadReservada) !== null ? l.cantidadEnBodega - l.cantidadReservada : null,
    pesoKg: numero(l.pesoKg), vencimiento: fecha(l.fechaVencimiento), estado: texto(l.estado),
    zona: texto(l.zona), conservacion: texto(l.conservacion),
    atributos: Object.entries(l.atributos || {}).filter(([, v]) => ["string", "number", "boolean"].includes(typeof v))
      .map(([nombre, valor]) => ({ nombre, valor: String(valor) })) }));
  const lotesPorId = new Map(lotes.map(l => [l.id, l]));
  const c = refs.contraparte;
  const contacto = tipo === "donaciones" ? c?.contacto : c?.responsable;
  const convenio = refs.convenio;
  // Defensa adicional: un identificador ajeno no revela ni siquiera el nombre de su archivo.
  const idsArchivos = new Set((registro.archivos || []).map(idTexto));
  const archivos = refs.archivos.filter(a => idsArchivos.has(idTexto(a._id))
    && a.metadata?.entidad === tipo && idTexto(a.metadata?.entidadId) === idTexto(registro._id))
    .map(a => ({ id: idTexto(a._id), nombre: texto(a.filename), tipo: texto(a.metadata?.tipo),
      mime: texto(a.metadata?.mimeType), bytes: numero(a.length), fecha: fecha(a.uploadDate), descripcion: texto(a.metadata?.descripcion) }));
  const r = registro.revision || {};
  return {
    id: idTexto(registro._id)!, tipo, codigo: texto(registro.codigo) || "Sin código", estado: texto(registro.estado) || "",
    contraparteNombreRegistrado: texto(tipo === "donaciones" ? registro.donante?.nombre : registro.organizacion?.nombre),
    contraparte: c ? { id: idTexto(c._id), nombre: texto(c.nombre), tipo: texto(c.tipo), direccion: texto(c.direccion),
      nit: tipo === "donaciones" ? texto(c.nit) : null,
      contacto: { nombre: texto(contacto?.nombre), email: texto(contacto?.email), telefono: texto(contacto?.telefono),
        funcion: texto(contacto?.funcion), medio: texto(contacto?.medio) } } : null,
    convenioReferenciado: Boolean(idTexto(registro.convenioId)),
    convenio: convenio ? { codigo: texto(convenio.codigo), nombre: texto(convenio.nombre), version: numero(convenio.version),
      desde: fecha(convenio.desde), hasta: fecha(convenio.hasta), periodicidad: texto(convenio.periodicidad),
      condiciones: texto(convenio.condiciones), pdfRegistrado: Boolean(idTexto(convenio.pdfId)) } : null,
    autor: persona(registro.registradaPor), autorReferenciado: Boolean(idTexto(registro.registradaPor)),
    responsableEntrega: persona(registro.entregadaPor), responsablePrevisto: persona(registro.responsablePrevistoId),
    registradaEn: fecha(registro.registradaEn), fechaRecepcion: fecha(registro.fechaRecepcion),
    fechaProgramada: fecha(registro.fechaProgramada), fechaEntrega: fecha(registro.fechaEntrega),
    versionDatos: numero(registro.versionDatos), migradaEn: fecha(registro.migracionV2?.fecha),
    observaciones: texto(registro.observaciones), lugar: texto(registro.lugar), recibidoPor: texto(registro.recibidoPor),
    requiereReasignacion: registro.requiereReasignacion === true,
    atrasada: registro.estado === "programada" && registro.fechaProgramada instanceof Date && registro.fechaProgramada < new Date(),
    // El modelo anterior conservaba cifras previstas en campos con nombre de ejecución.
    // Una programación sin fechaEntrega no acredita atenciones ni peso entregado.
    beneficiariosPrevistos: numero(registro.beneficiariosPrevistos),
    beneficiariosAtendidos: fecha(registro.fechaEntrega) ? numero(registro.beneficiariosAtendidos) : null,
    pesoTotalKg: tipo === "entregas" && !fecha(registro.fechaEntrega) ? null : numero(registro.pesoTotalKg), lotes,
    lineasEntrega: objetos(registro.items).map(i => ({ loteId: idTexto(i.loteId),
      lote: lotesPorId.get(idTexto(i.loteId) || "") || null, unidad: texto(i.unidad),
      programada: numero(i.cantidadProgramada), reservada: numero(i.cantidadReservada), entregada: numero(i.cantidadEntregada) })),
    salidas: (refs.salidas || []).filter(s => idTexto(s.entregaId) === idTexto(registro._id) && s.tipo === "entrega").map(s => {
      const relacionados = objetos(s.relacionados).filter(m => idTexto(m.origenId) === idTexto(s._id) && idTexto(m.loteId) === idTexto(s.loteId));
      const redondear = (n: number) => Math.round(n * 1000) / 1000;
      const correccion = relacionados.reduce((n, m) => n + (m.tipo === "ajusteEntrada" ? -1 : m.tipo === "ajusteSalida" ? 1 : 0) * (numero(m.cantidad) || 0), 0);
      const devuelta = redondear(relacionados.filter(m => m.tipo === "devolucionEntrada").reduce((n, m) => n + (numero(m.cantidad) || 0), 0));
      const original = numero(s.cantidad) || 0, corregida = redondear(original + correccion);
      return { movimientoId: idTexto(s._id)!, loteId: idTexto(s.loteId)!, unidad: texto(s.unidad) || "", original, corregida, devuelta, neta: redondear(corregida - devuelta) };
    }),
    archivos, archivosNoDisponibles: idsArchivos.size - archivos.length,
    revision: { persona: persona(r.revisadaPor), fecha: fecha(r.revisadaEn), version: numero(r.versionRevisada),
      rolAlRevisar: texto(r.rolAlRevisar), observacion: texto(r.observacion) },
    historial: objetos(registro.historial).map(h => ({ accion: texto(h.accion), fecha: fecha(h.fecha),
      persona: persona(h.usuarioId), detalle: texto(h.detalle), version: numero(h.versionDatos) }))
  };
}
export type FichaOperacion = ReturnType<typeof fichaPublica>;
