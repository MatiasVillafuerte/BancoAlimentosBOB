import "server-only";
import { ObjectId, type Db, type Document } from "mongodb";
import { obtenerBase } from "../db";
import type { UsuarioPublico } from "../auth/types";
import { alcanceOperaciones, fichaPublica, filaPublica, idTexto, pipelineListado, PROYECCION_LOTE,
  PROYECCION_OPERACION, PROYECCION_PERSONA, TAMANO_PAGINA,
  type TipoConsulta, type TipoOperacion, type FiltrosConsulta } from "./modelo";

async function personasDe(bd: Db, ids: unknown[]) {
  const unicos = [...new Set(ids.map(idTexto).filter((id): id is string => Boolean(id)))];
  if (!unicos.length) return new Map<string, Document>();
  const personas = await bd.collection("voluntarios").find({ _id: { $in: unicos.map(id => new ObjectId(id)) } },
    { projection: PROYECCION_PERSONA }).toArray();
  return new Map(personas.map(p => [p._id.toHexString(), p]));
}

export async function listarOperaciones(usuario: UsuarioPublico, tipo: TipoConsulta, filtros: FiltrosConsulta) {
  const bd = await obtenerBase();
  const [pagina] = await bd.collection(tipo === "alertas" ? "donaciones" : tipo)
    .aggregate<{ registros: Document[]; total: { cantidad: number }[] }>(pipelineListado(usuario, tipo, filtros)).toArray();
  const registros = pagina?.registros || [];
  const personas = await personasDe(bd, registros.map(r => r.registradaPor));
  const total = pagina?.total[0]?.cantidad || 0;
  return { registros: registros.map(r => filaPublica(r, personas)), total, pagina: filtros.pagina,
    paginas: Math.ceil(total / TAMANO_PAGINA), tamanoPagina: TAMANO_PAGINA };
}
export type ListadoOperaciones = Awaited<ReturnType<typeof listarOperaciones>>;

export async function obtenerFicha(usuario: UsuarioPublico, tipo: TipoOperacion, id: string) {
  if (!/^[a-f\d]{24}$/i.test(id)) return null;
  const bd = await obtenerBase();
  const registro = await bd.collection(tipo).findOne({ _id: new ObjectId(id), ...alcanceOperaciones(usuario, tipo) },
    { projection: PROYECCION_OPERACION });
  if (!registro) return null;
  const esDonacion = tipo === "donaciones";
  const contraparteId = esDonacion ? registro.donante?.donanteId : registro.organizacion?.organizacionId;
  const idsLotes = (registro.items || []).map((i: Document) => i.loteId).filter((i: unknown) => i instanceof ObjectId);
  const idsArchivos = (registro.archivos || []).filter((i: unknown) => i instanceof ObjectId);
  const [personas, lotes, contraparte, convenio, archivos, salidas] = await Promise.all([
    personasDe(bd, [registro.registradaPor, registro.entregadaPor, registro.responsablePrevistoId,
      registro.revision?.revisadaPor, ...(registro.historial || []).flatMap((h: Document) => [h.usuarioId, h.revisionAnterior?.revisadaPor])]),
    bd.collection("lotes").find(esDonacion ? { donacionId: registro._id } : { _id: { $in: idsLotes } },
      { projection: PROYECCION_LOTE }).sort({ codigo: 1 }).toArray(),
    contraparteId instanceof ObjectId ? bd.collection(esDonacion ? "donantes" : "organizaciones")
      .findOne({ _id: contraparteId }, { projection: { _id: 1, nombre: 1, tipo: 1, direccion: 1, nit: 1,
        "contacto.nombre": 1, "contacto.email": 1, "contacto.telefono": 1, "contacto.funcion": 1,
        "contacto.medio": 1, "responsable.nombre": 1, "responsable.telefono": 1 } }) : null,
    esDonacion && registro.convenioId instanceof ObjectId ? bd.collection("convenios")
      .findOne({ _id: registro.convenioId, donanteId: contraparteId }, { projection: { codigo: 1, nombre: 1,
        version: 1, desde: 1, hasta: 1, periodicidad: 1, condiciones: 1, pdfId: 1 } }) : null,
    idsArchivos.length ? bd.collection("fs.files").find({ _id: { $in: idsArchivos },
      "metadata.entidad": tipo, "metadata.entidadId": registro._id }, { projection: { _id: 1, filename: 1,
        length: 1, uploadDate: 1, "metadata.entidad": 1, "metadata.entidadId": 1,
        "metadata.tipo": 1, "metadata.mimeType": 1, "metadata.descripcion": 1 } }).sort({ uploadDate: -1 }).toArray() : [],
    esDonacion ? [] : bd.collection("movimientos").aggregate([
      { $match: { entregaId: registro._id, tipo: "entrega" } },
      { $lookup: { from: "movimientos", localField: "_id", foreignField: "origenId", pipeline: [
        { $project: { origenId: 1, loteId: 1, cantidad: 1, tipo: 1 } }], as: "relacionados" } },
      { $project: { entregaId: 1, loteId: 1, cantidad: 1, tipo: 1, unidad: 1, relacionados: 1 } }
    ]).toArray()
  ]);
  return fichaPublica(registro, tipo, { personas, lotes, contraparte, convenio, archivos, salidas });
}
