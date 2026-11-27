import { ObjectId, type ClientSession, type Db, type MongoClient } from "mongodb";
import type { UsuarioPublico } from "./auth/types";
import { ErrorRegistro } from "./registros/modelo";

export type PermisoEscritura = "recepcion" | "gestion" | "usuarios";
export function ejecutarTransaccion<T>(cliente: MongoClient, accion: (session: ClientSession) => Promise<T>): Promise<T> {
  return cliente.withSession(session => session.withTransaction(() => accion(session), {
    readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary", maxCommitTimeMS: 10000, timeoutMS: 20000
  }));
}
export async function autorizarEscritura(bd: Db, usuario: UsuarioPublico, session: ClientSession, permiso: PermisoEscritura) {
  const roles = permiso === "usuarios" ? ["administrador"] : permiso === "gestion" ? ["administrador", "coordinador"] :
    ["administrador", "coordinador", "voluntario"];
  // Serializa la autorización con bajas y cambios de rol concurrentes.
  const resultado = await bd.collection("voluntarios").updateOne({ _id: new ObjectId(usuario.id), activo: true,
    rol: { $in: roles, $eq: usuario.rol } }, { $inc: { versionAcciones: 1 } }, { session });
  if (!resultado.matchedCount) throw new ErrorRegistro("Tu cuenta ya no tiene permiso para realizar esta acción. Actualiza la página.", 403);
}
