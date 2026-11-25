import "server-only";
import { ObjectId, type Collection } from "mongodb";
import { obtenerBase } from "../db";
import { MAX_INTENTOS, MAX_SESIONES, VENTANA_INTENTOS_MS } from "./core";
import type { AlmacenAutenticacion, SesionGuardada, UsuarioAutenticacion } from "./types";

interface UsuarioMongo extends Omit<UsuarioAutenticacion, "id"> {
  _id: ObjectId;
  sesiones?: SesionGuardada[];
  acceso?: { intentos: number; ventanaDesde: Date };
  ultimoAccesoEn?: Date;
  passwordActualizadaEn?: Date;
}

const proyeccion = { nombre: 1, email: 1, telefono: 1, rol: 1, activo: 1, passwordHash: 1 };
function adaptar(u: UsuarioMongo | null): UsuarioAutenticacion | null {
  return u ? { id: u._id.toHexString(), nombre: u.nombre, email: u.email,
    telefono: u.telefono, rol: u.rol, activo: u.activo, passwordHash: u.passwordHash } : null;
}
async function usuarios(): Promise<Collection<UsuarioMongo>> {
  return (await obtenerBase()).collection<UsuarioMongo>("voluntarios");
}

export class AlmacenMongo implements AlmacenAutenticacion {
  async reservarIntento(email: string, ahora: Date) {
    const limite = new Date(ahora.getTime() - VENTANA_INTENTOS_MS);
    const vigente = { $gt: ["$acceso.ventanaDesde", limite] };
    // El filtro y el incremento se ejecutan juntos: cinco solicitudes concurrentes no abren una sexta.
    const usuario = await (await usuarios()).findOneAndUpdate({
      email, activo: true,
      $or: [
        { "acceso.ventanaDesde": { $exists: false } },
        { "acceso.ventanaDesde": { $lte: limite } },
        { "acceso.intentos": { $lt: MAX_INTENTOS } }
      ]
    }, [{ $set: {
      "acceso.intentos": { $cond: [vigente, { $add: [{ $ifNull: ["$acceso.intentos", 0] }, 1] }, 1] },
      "acceso.ventanaDesde": { $cond: [vigente, "$acceso.ventanaDesde", ahora] }
    } }], { returnDocument: "after", projection: proyeccion });
    return adaptar(usuario);
  }

  async agregarSesion(usuario: UsuarioAutenticacion, sesion: SesionGuardada) {
    const coleccion = await usuarios();
    await coleccion.updateOne({ _id: new ObjectId(usuario.id) }, {
      $pull: { sesiones: { expiraEn: { $lte: sesion.creadaEn } } }
    });
    const r = await coleccion.updateOne({
      _id: new ObjectId(usuario.id), activo: true, passwordHash: usuario.passwordHash
    }, {
      $push: { sesiones: { $each: [sesion], $slice: -MAX_SESIONES } },
      $set: { ultimoAccesoEn: sesion.creadaEn, acceso: { intentos: 0, ventanaDesde: sesion.creadaEn } }
    });
    return r.matchedCount === 1;
  }

  async buscarSesion(id: string, tokenHash: string, ahora: Date) {
    return adaptar(await (await usuarios()).findOne({
      _id: new ObjectId(id), activo: true,
      sesiones: { $elemMatch: { tokenHash, expiraEn: { $gt: ahora } } }
    }, { projection: proyeccion }));
  }

  async eliminarSesion(id: string, tokenHash: string) {
    await (await usuarios()).updateOne({ _id: new ObjectId(id) }, { $pull: { sesiones: { tokenHash } } });
  }

  async cambiarPassword(usuario: UsuarioAutenticacion, tokenAnteriorHash: string,
    nuevoHash: string, sesion: SesionGuardada) {
    const r = await (await usuarios()).updateOne({
      _id: new ObjectId(usuario.id), activo: true, passwordHash: usuario.passwordHash,
      sesiones: { $elemMatch: { tokenHash: tokenAnteriorHash, expiraEn: { $gt: sesion.creadaEn } } }
    }, { $set: { passwordHash: nuevoHash, passwordActualizadaEn: sesion.creadaEn,
      sesiones: [sesion], acceso: { intentos: 0, ventanaDesde: sesion.creadaEn } } });
    return r.matchedCount === 1;
  }
}
