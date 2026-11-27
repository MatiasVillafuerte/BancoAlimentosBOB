import { createHash } from "node:crypto";
import { ObjectId, type ClientSession, type Db, type Document, type MongoClient } from "mongodb";
import type { UsuarioPublico } from "../auth/types";
import { alcanceOperaciones, type TipoOperacion } from "../operaciones/modelo";
import { ErrorRegistro, idSchema, puedeGestionar, validar } from "../registros/modelo";
import { autorizarEscritura, ejecutarTransaccion, type PermisoEscritura } from "../transacciones";
import { AlmacenArchivos } from "./almacen";
import { validarContenido } from "./validacion";
import { cargaSchema, corregirDonacionSchema, corregirEntregaSchema, envioSchema, MAX_ARCHIVOS, reaperturaSchema,
  retiroSchema, revisionSchema, VALIDACION_ARCHIVO, type ArchivoVista, type DocumentacionVista, type EntidadDocumental } from "./modelo";

const oid = (id: string) => new ObjectId(validar(idSchema, id));
const versionDe = (d: Document) => typeof d.versionDatos === "number" ? d.versionDatos : 0;
const huella = (d: unknown) => createHash("sha256").update(JSON.stringify(d)).digest("hex");
const claveDe = (u: UsuarioPublico, clave: string) => `${u.id}:${clave}`;
const idsActivos = (d: Document, entidad: EntidadDocumental): ObjectId[] => (entidad === "convenios" ? [d.pdfId] : d.archivos || []).filter((id: unknown) => id instanceof ObjectId);
const verificado = (f: Document) => f.metadata?.validacion === VALIDACION_ARCHIVO && f.length > 0 &&
  ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(f.metadata.mimeType) && /^[a-f0-9]{64}$/.test(f.metadata.sha256 || "");
interface DocumentoHistorial { _id: ObjectId; historial?: Document[]; versionDatos?: number }

export class ServicioDocumentos {
  readonly almacen: AlmacenArchivos;
  constructor(private readonly cliente: MongoClient, private readonly bd: Db, private readonly reloj = () => new Date()) {
    this.almacen = new AlmacenArchivos(cliente, bd);
  }
  private transaccion<T>(u: UsuarioPublico, permiso: PermisoEscritura, fn: (s: ClientSession) => Promise<T>) {
    return ejecutarTransaccion(this.cliente, async s => { await autorizarEscritura(this.bd, u, s, permiso); return fn(s); });
  }
  private async contexto(u: UsuarioPublico, entidad: EntidadDocumental, id: string, session?: ClientSession) {
    const d = await this.bd.collection(entidad).findOne({ _id: oid(id), ...(entidad === "convenios" ? {} : alcanceOperaciones(u, entidad)) }, { session });
    if (!d) throw new ErrorRegistro("No encontramos un expediente disponible para tu cuenta.", 404);
    return d;
  }
  private editable(u: UsuarioPublico, entidad: EntidadDocumental, d: Document, version: number) {
    if (entidad === "convenios" && !puedeGestionar(u.rol)) throw new ErrorRegistro("Solo coordinación y administración incorporan el PDF de un convenio.", 403);
    if (versionDe(d) !== version) throw new ErrorRegistro("El expediente cambió. Recarga la información antes de continuar.", 409);
    if (d.estado === "completada") throw new ErrorRegistro("Administración debe reabrir el expediente antes de modificar sus datos o evidencias.", 409);
    if (d.estado === "cancelada") throw new ErrorRegistro("Una entrega cancelada conserva su expediente sin admitir nuevas evidencias.", 409);
  }
  private anterior(d: Document, u: UsuarioPublico, clave: string, accion: string, hash: string) {
    const h = (d.historial || []).find((h: Document) => h.claveOperacion === claveDe(u, clave));
    if (!h) return null;
    if (h.accion !== accion || h.solicitudHash !== hash) throw new ErrorRegistro("La clave del envío ya se utilizó para otra acción o contenido.", 409);
    return { id: String(d._id), versionDatos: h.versionDatos as number, repetida: true, ...(h.archivoId ? { archivoId: String(h.archivoId) } : {}) };
  }
  private estadoTrasCambio(d: Document) {
    return ["recibida", "entregada"].includes(d.estado) ? "por_documentar" : d.estado;
  }
  private revisionTrasCambio(d: Document) { return d.estado === "observada" ? d.revision : {}; }
  private async actualizar(u: UsuarioPublico, entidad: EntidadDocumental, d: Document, accion: string, clave: string, hash: string,
    campos: Document, detalle: string, session: ClientSession, extra: Document = {}, aumentar = true) {
    const versionDatos = versionDe(d) + (aumentar ? 1 : 0);
    const filtro: Document = { _id: d._id, ...(d.versionDatos === undefined ? { versionDatos: { $exists: false } } : { versionDatos: d.versionDatos }) };
    if (entidad !== "convenios") filtro.estado = d.estado;
    const evento = { accion, usuarioId: oid(u.id), fecha: this.reloj(), versionDatos, detalle, claveOperacion: claveDe(u, clave), solicitudHash: hash,
      ...(d.revision && Object.keys(d.revision).length ? { revisionAnterior: d.revision } : {}), ...extra };
    const r = await this.bd.collection<DocumentoHistorial>(entidad).updateOne(filtro,
      { $set: { ...campos, versionDatos }, $push: { historial: evento } }, { session });
    if (!r.matchedCount) throw new ErrorRegistro("Otra persona cambió el expediente. Recarga para revisar la versión actual.", 409);
    return { id: String(d._id), versionDatos, repetida: false, ...(extra.archivoId ? { archivoId: String(extra.archivoId) } : {}) };
  }
  private archivos(d: Document, entidad: EntidadDocumental, session?: ClientSession) {
    return this.bd.collection("fs.files").find({ _id: { $in: idsActivos(d, entidad) },
      "metadata.entidad": entidad, "metadata.entidadId": d._id }, { session }).toArray();
  }
  private async pendientes(entidad: EntidadDocumental, d: Document, archivos: Document[], session?: ClientSession): Promise<string[]> {
    if (entidad === "convenios") return archivos.some(f => verificado(f) && f.metadata.estado === "vinculado" && f.metadata.tipo === "pdf") ? [] : ["Falta incorporar el PDF original de esta versión."];
    const faltas: string[] = [];
    if (d.estado === "programada" || d.estado === "cancelada") return ["La entrega debe haberse realizado antes de presentar su documentación."];
    if (archivos.length !== idsActivos(d, entidad).length || archivos.some(f => !verificado(f) || f.metadata.estado !== "vinculado")) {
      faltas.push("Hay evidencias referenciadas que no están disponibles o no tienen validación de contenido.");
    }
    if (!archivos.some(f => verificado(f) && f.metadata.estado === "vinculado" && f.metadata.tipo === "foto" && f.metadata.mimeType.startsWith("image/"))) {
      faltas.push(`Falta al menos una fotografía válida de esta ${entidad === "donaciones" ? "recepción" : "entrega"}.`);
    }
    const fecha = entidad === "donaciones" ? d.fechaRecepcion : d.fechaEntrega;
    if (!(fecha instanceof Date) || fecha > this.reloj()) faltas.push("La fecha del hecho debe estar registrada y no puede ser futura.");
    const contraparte = entidad === "donaciones" ? d.donante?.donanteId : d.organizacion?.organizacionId;
    if (!(contraparte instanceof ObjectId) || !await this.bd.collection(entidad === "donaciones" ? "donantes" : "organizaciones").findOne({ _id: contraparte }, { session, projection: { _id: 1 } })) {
      faltas.push("Falta una contraparte válida vinculada al expediente.");
    }
    if (entidad === "donaciones") {
      if (!await this.bd.collection("lotes").findOne({ donacionId: d._id }, { session, projection: { _id: 1 } })) faltas.push("La recepción no tiene lotes registrados.");
      if (d.convenioId && !await this.bd.collection("convenios").findOne({ _id: d.convenioId, donanteId: contraparte }, { session, projection: { _id: 1 } })) {
        faltas.push("El convenio asociado no corresponde al donante o no está disponible.");
      }
    } else {
      if (!String(d.lugar || "").trim() || !String(d.recibidoPor || "").trim()) faltas.push("Completa el lugar y la persona que recibió la entrega.");
      if (!Number.isInteger(d.beneficiariosAtendidos) || d.beneficiariosAtendidos < 0) faltas.push("Completa las atenciones realizadas.");
      if (!(d.entregadaPor instanceof ObjectId) || !await this.bd.collection("voluntarios").findOne({ _id: d.entregadaPor }, { session, projection: { _id: 1 } })) faltas.push("No se encontró al responsable de la entrega real.");
      const items: Document[] = d.items || [];
      if (!items.length || !items.some(i => i.cantidadEntregada > 0) || items.some(i => !(i.loteId instanceof ObjectId) || !i.unidad || !Number.isFinite(i.cantidadEntregada) || i.cantidadEntregada < 0)) {
        faltas.push("Las cantidades reales por lote están incompletas.");
      }
    }
    return faltas;
  }
  async detalle(u: UsuarioPublico, entidad: EntidadDocumental, id: string): Promise<DocumentacionVista> {
    const d = await this.contexto(u, entidad, id), actuales = await this.archivos(d, entidad);
    const retirados = await this.bd.collection("fs.files").find({ "metadata.entidad": entidad, "metadata.entidadId": d._id,
      "metadata.estado": "retirado", _id: { $in: (d.historial || []).map((h: Document) => h.archivoId).filter((id: unknown) => id instanceof ObjectId) } }).sort({ uploadDate: -1 }).limit(100).toArray();
    const personas = await this.bd.collection("voluntarios").find({ _id: { $in: [...actuales, ...retirados].map(f => f.metadata?.subidoPor).filter(id => id instanceof ObjectId) } }, { projection: { nombre: 1 } }).toArray();
    function vista(f: Document): ArchivoVista {
      return { id: String(f._id), nombre: f.filename || "Archivo", tipo: f.metadata.tipo === "foto" ? "foto" : "pdf", mime: f.metadata.mimeType || "",
        bytes: f.length, fecha: f.uploadDate.toISOString(), descripcion: f.metadata.descripcion || "", loteId: f.metadata.loteId ? String(f.metadata.loteId) : null,
        subidoPor: personas.find(p => String(p._id) === String(f.metadata.subidoPor))?.nombre || "Responsable no disponible",
        estado: f.metadata.estado || "legado", verificado: verificado(f) };
    }
    const cerrada = ["completada", "cancelada"].includes(d.estado), real = entidad !== "convenios" && !["programada", "cancelada"].includes(d.estado);
    return { entidad, id, estado: d.estado || "convenio", versionDatos: versionDe(d), archivos: actuales.map(vista), retirados: retirados.map(vista),
      referenciasNoDisponibles: idsActivos(d, entidad).length - actuales.length, pendientes: await this.pendientes(entidad, d, actuales),
      puedeSubir: !cerrada && (entidad === "convenios" ? puedeGestionar(u.rol) && !d.pdfId : idsActivos(d, entidad).length < MAX_ARCHIVOS),
      puedeRetirar: entidad !== "convenios" && !cerrada, puedeCorregir: real && !cerrada,
      puedeEnviar: real && ["por_documentar", "observada"].includes(d.estado),
      puedeRevisar: u.rol === "administrador" && ["recibida", "entregada"].includes(d.estado),
      puedeReabrir: u.rol === "administrador" && d.estado === "completada" };
  }
  async subir(u: UsuarioPublico, entrada: unknown, bytes: Buffer, nombre: string) {
    const datos = validar(cargaSchema, entrada), permiso = datos.entidad === "convenios" ? "gestion" : "recepcion";
    const inicial = await this.contexto(u, datos.entidad, datos.entidadId);
    const cuenta = await this.bd.collection("voluntarios").findOne({ _id: oid(u.id), activo: true, rol: u.rol }, { projection: { _id: 1 } });
    if (!cuenta || (permiso === "gestion" && !puedeGestionar(u.rol))) throw new ErrorRegistro("Tu cuenta no tiene permiso para cargar este archivo.", 403);
    const contenido = await validarContenido(bytes, nombre);
    if (datos.entidad === "convenios" && contenido.tipo !== "pdf") throw new ErrorRegistro("El archivo de un convenio debe ser su PDF original.");
    if (datos.loteId && contenido.tipo !== "foto") throw new ErrorRegistro("La referencia de lote corresponde a una fotografía de recepción.");
    const hash = huella({ ...datos, contenido });
    const repetida = this.anterior(inicial, u, datos.claveOperacion, "archivo_incorporado", hash);
    if (repetida) return repetida;
    this.editable(u, datos.entidad, inicial, datos.versionDatos);
    if (datos.entidad === "convenios" && inicial.pdfId) throw new ErrorRegistro("Esta versión ya conserva su PDF. Crea una nueva versión para incorporar otro contrato.", 409);
    const id = new ObjectId();
    await this.almacen.cargar(id, contenido.nombre, bytes, { entidad: datos.entidad, entidadId: oid(datos.entidadId), tipo: contenido.tipo,
      subidoPor: oid(u.id), descripcion: datos.descripcion, ...(datos.loteId ? { loteId: oid(datos.loteId) } : {}),
      mimeType: contenido.mime, sha256: contenido.sha256, ...(contenido.ancho ? { ancho: contenido.ancho, alto: contenido.alto } : {}),
      ...(contenido.paginas ? { paginas: contenido.paginas } : {}), validacion: VALIDACION_ARCHIVO, verificadaEn: this.reloj(),
      estado: "temporal", claveOperacion: claveDe(u, datos.claveOperacion) });
    try {
      return await this.transaccion(u, permiso, async s => {
        const d = await this.contexto(u, datos.entidad, datos.entidadId, s);
        const anterior = this.anterior(d, u, datos.claveOperacion, "archivo_incorporado", hash);
        if (anterior) return anterior;
        this.editable(u, datos.entidad, d, datos.versionDatos);
        if (datos.entidad === "convenios" && d.pdfId) throw new ErrorRegistro("Otra carga ya incorporó el PDF de esta versión.", 409);
        if (datos.entidad !== "convenios" && idsActivos(d, datos.entidad).length >= MAX_ARCHIVOS) throw new ErrorRegistro("Se admiten hasta 20 archivos activos por operación.");
        if (datos.loteId && !await this.bd.collection("lotes").findOne({ _id: oid(datos.loteId), donacionId: d._id }, { session: s, projection: { _id: 1 } })) throw new ErrorRegistro("La fotografía debe referirse a un lote de esta recepción.");
        const f = await this.bd.collection("fs.files").updateOne({ _id: id, "metadata.estado": "temporal", "metadata.validacion": VALIDACION_ARCHIVO },
          { $set: { "metadata.estado": "vinculado" } }, { session: s });
        if (!f.matchedCount) throw new ErrorRegistro("No se encontró una carga completa disponible para vincular.", 409);
        const campos = datos.entidad === "convenios" ? { pdfId: id } : { archivos: [...idsActivos(d, datos.entidad), id], estado: this.estadoTrasCambio(d), revision: this.revisionTrasCambio(d) };
        return this.actualizar(u, datos.entidad, d, "archivo_incorporado", datos.claveOperacion, hash, campos,
          `Se incorporó ${contenido.nombre}. ${datos.descripcion}`.trim(), s, { archivoId: id });
      });
    } finally {
      try { await this.almacen.limpiarTemporal(id); }
      catch { console.error("[BAB] Una carga temporal requiere mantenimiento."); }
    }
  }
  async obtenerArchivo(u: UsuarioPublico, id: string) {
    const f = await this.bd.collection("fs.files").findOne({ _id: oid(id) });
    const m = f?.metadata;
    if (!f || !m || !["donaciones", "entregas", "convenios"].includes(m.entidad) || !(m.entidadId instanceof ObjectId) || !verificado(f)) throw new ErrorRegistro("El archivo no está disponible.", 404);
    const d = await this.contexto(u, m.entidad, String(m.entidadId));
    const activo = m.estado === "vinculado" && idsActivos(d, m.entidad).some(a => a.equals(f._id));
    const retirado = m.estado === "retirado" && (d.historial || []).some((h: Document) => h.accion === "archivo_retirado" && String(h.archivoId) === id);
    if (!activo && !retirado) throw new ErrorRegistro("El archivo no está vinculado a este expediente.", 404);
    return f;
  }
  async retirar(u: UsuarioPublico, id: string, entrada: unknown) {
    const datos = validar(retiroSchema, entrada), hash = huella({ id, ...datos });
    return this.transaccion(u, "recepcion", async s => {
      const f = await this.bd.collection("fs.files").findOne({ _id: oid(id) }, { session: s });
      if (!f || !["donaciones", "entregas"].includes(f.metadata?.entidad)) throw new ErrorRegistro("Solo se retiran evidencias de donaciones o entregas. El PDF contractual se conserva por versión.", 409);
      const entidad = f.metadata.entidad as TipoOperacion, d = await this.contexto(u, entidad, String(f.metadata.entidadId), s);
      const repetida = this.anterior(d, u, datos.claveOperacion, "archivo_retirado", hash); if (repetida) return repetida;
      this.editable(u, entidad, d, datos.versionDatos);
      if (!idsActivos(d, entidad).some(a => a.equals(f._id)) || ![undefined, "legado", "vinculado"].includes(f.metadata.estado)) throw new ErrorRegistro("La evidencia ya no está activa en este expediente.", 409);
      await this.bd.collection("fs.files").updateOne({ _id: f._id, "metadata.estado": f.metadata.estado === undefined ? { $exists: false } : f.metadata.estado },
        { $set: { "metadata.estado": "retirado", "metadata.retiradoPor": oid(u.id), "metadata.retiradoEn": this.reloj(), "metadata.motivoRetiro": datos.motivo } }, { session: s });
      return this.actualizar(u, entidad, d, "archivo_retirado", datos.claveOperacion, hash,
        { archivos: idsActivos(d, entidad).filter(a => !a.equals(f._id)), estado: this.estadoTrasCambio(d), revision: this.revisionTrasCambio(d) },
        `${f.filename}: ${datos.motivo}`, s, { archivoId: f._id });
    });
  }
  async enviar(u: UsuarioPublico, entidad: TipoOperacion, id: string, entrada: unknown) {
    const datos = validar(envioSchema, entrada), hash = huella(datos);
    return this.transaccion(u, "recepcion", async s => {
      const d = await this.contexto(u, entidad, id, s);
      const repetida = this.anterior(d, u, datos.claveOperacion, "documentacion_presentada", hash); if (repetida) return repetida;
      this.editable(u, entidad, d, datos.versionDatos);
      if (!["por_documentar", "observada"].includes(d.estado)) throw new ErrorRegistro("Solo se presenta una operación realizada que esté por documentar o con observaciones.", 409);
      const pendientes = await this.pendientes(entidad, d, await this.archivos(d, entidad, s), s);
      if (pendientes.length) throw new ErrorRegistro(pendientes.join(" "));
      return this.actualizar(u, entidad, d, "documentacion_presentada", datos.claveOperacion, hash,
        { estado: entidad === "donaciones" ? "recibida" : "entregada", revision: {} }, "Datos y evidencias enviados a revisión administrativa.", s);
    });
  }
  async revisar(u: UsuarioPublico, entidad: TipoOperacion, id: string, entrada: unknown) {
    const datos = validar(revisionSchema, entrada), hash = huella(datos);
    const accion = datos.decision === "aprobar" ? "revision_aprobada" : "revision_observada";
    return this.transaccion(u, "usuarios", async s => {
      const d = await this.contexto(u, entidad, id, s);
      const repetida = this.anterior(d, u, datos.claveOperacion, accion, hash); if (repetida) return repetida;
      if (versionDe(d) !== datos.versionDatos || d.estado !== (entidad === "donaciones" ? "recibida" : "entregada")) throw new ErrorRegistro("El expediente ya no está pendiente de revisar en esa versión. Recarga su información.", 409);
      if (datos.decision === "aprobar") {
        const pendientes = await this.pendientes(entidad, d, await this.archivos(d, entidad, s), s);
        if (pendientes.length) throw new ErrorRegistro(pendientes.join(" "));
      }
      const revision = { revisadaPor: oid(u.id), revisadaEn: this.reloj(), rolAlRevisar: "administrador", versionRevisada: versionDe(d), observacion: datos.observacion || "" };
      return this.actualizar(u, entidad, d, accion, datos.claveOperacion, hash,
        { estado: datos.decision === "aprobar" ? "completada" : "observada", revision },
        datos.observacion || "Administración validó manualmente los datos y evidencias de esta versión.", s, {}, false);
    });
  }
  async reabrir(u: UsuarioPublico, entidad: TipoOperacion, id: string, entrada: unknown) {
    const datos = validar(reaperturaSchema, entrada), hash = huella(datos);
    return this.transaccion(u, "usuarios", async s => {
      const d = await this.contexto(u, entidad, id, s);
      const repetida = this.anterior(d, u, datos.claveOperacion, "expediente_reabierto", hash); if (repetida) return repetida;
      if (versionDe(d) !== datos.versionDatos || d.estado !== "completada") throw new ErrorRegistro("Solo se reabre un expediente completado en la versión que consultaste.", 409);
      return this.actualizar(u, entidad, d, "expediente_reabierto", datos.claveOperacion, hash,
        { estado: "por_documentar", revision: {} }, datos.motivo, s);
    });
  }
  async corregir(u: UsuarioPublico, entidad: TipoOperacion, id: string, entrada: unknown) {
    const datos = entidad === "donaciones" ? validar(corregirDonacionSchema, entrada) : validar(corregirEntregaSchema, entrada);
    const hash = huella(datos);
    return this.transaccion(u, "recepcion", async s => {
      const d = await this.contexto(u, entidad, id, s);
      const repetida = this.anterior(d, u, datos.claveOperacion, "documentacion_corregida", hash); if (repetida) return repetida;
      this.editable(u, entidad, d, datos.versionDatos);
      if (d.estado === "programada") throw new ErrorRegistro("Modifica la programación desde sus acciones. Los datos reales se completan al confirmar la entrega.", 409);
      const campos: Document = { observaciones: datos.observaciones };
      if ("lugar" in datos && "recibidoPor" in datos && "beneficiariosAtendidos" in datos) Object.assign(campos, { lugar: datos.lugar, recibidoPor: datos.recibidoPor, beneficiariosAtendidos: datos.beneficiariosAtendidos });
      return this.actualizar(u, entidad, d, "documentacion_corregida", datos.claveOperacion, hash,
        { ...campos, estado: this.estadoTrasCambio(d), revision: this.revisionTrasCambio(d) }, datos.motivo, s);
    });
  }
}
