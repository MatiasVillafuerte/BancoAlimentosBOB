import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GridFSBucket, ObjectId, type ClientSession, type Db, type Document, type MongoClient } from "mongodb";
import { ejecutarTransaccion } from "../transacciones";
import { VALIDACION_ARCHIVO } from "./modelo";

export class AlmacenArchivos {
  readonly bucket: GridFSBucket;
  constructor(private readonly cliente: MongoClient, private readonly bd: Db) {
    this.bucket = new GridFSBucket(bd, { bucketName: "fs", writeConcern: { w: "majority" } });
  }
  async cargar(id: ObjectId, nombre: string, bytes: Buffer, metadata: Document) {
    const salida = this.bucket.openUploadStreamWithId(id, nombre, { metadata, timeoutMS: 60000 });
    function* trozos() { for (let i = 0; i < bytes.length; i += 255 * 1024) yield bytes.subarray(i, i + 255 * 1024); }
    // Un fragmento por escritura: no quedan múltiples insertOne en vuelo al fallar.
    try { await pipeline(Readable.from(trozos()), salida); }
    catch (e) {
      // Este identificador pertenece exclusivamente a este intento y aún no se ha vinculado.
      try { await this.bucket.delete(id); } catch { /* Un temporal completo puede retirarse luego con el mantenimiento. */ }
      throw e;
    }
  }
  async tieneReferencias(id: ObjectId, session: ClientSession) {
    for (const tipo of ["donaciones", "entregas"]) {
      if (await this.bd.collection(tipo).findOne({ $or: [{ archivos: id }, { "historial.archivoId": id }] }, { session, projection: { _id: 1 } })) return true;
    }
    if (await this.bd.collection("convenios").findOne({ $or: [{ pdfId: id }, { "historial.archivoId": id }] }, { session, projection: { _id: 1 } })) return true;
    return !!await this.bd.collection("organizaciones").findOne({ convenio: id }, { session, projection: { _id: 1 } });
  }
  async limpiarTemporal(id: ObjectId) {
    const eliminar = await ejecutarTransaccion(this.cliente, async session => {
      const f = await this.bd.collection("fs.files").findOne({ _id: id, "metadata.validacion": VALIDACION_ARCHIVO,
        "metadata.estado": { $in: ["temporal", "eliminando"] } }, { session });
      if (!f || await this.tieneReferencias(id, session)) return false;
      const r = await this.bd.collection("fs.files").updateOne({ _id: id, "metadata.estado": f.metadata.estado }, { $set: { "metadata.estado": "eliminando" } }, { session });
      return r.matchedCount === 1;
    });
    if (!eliminar) return false;
    // GridFS no admite transacciones; el estado anterior impide que se vincule durante el borrado.
    // Conserva el manifiesto eliminando hasta retirar todos los fragmentos: un fallo se puede reintentar.
    await this.bd.collection("fs.chunks").deleteMany({ files_id: id });
    await this.bd.collection("fs.files").deleteOne({ _id: id, "metadata.estado": "eliminando" });
    return true;
  }
  async limpiarAntiguos(ahora = new Date()) {
    const limite = new Date(ahora.getTime() - 24 * 3600000);
    const temporales = await this.bd.collection("fs.files").find({ "metadata.validacion": VALIDACION_ARCHIVO,
      "metadata.estado": { $in: ["temporal", "eliminando"] }, uploadDate: { $lt: limite } }, { projection: { _id: 1 } }).limit(100).toArray();
    let eliminados = 0;
    for (const f of temporales) if (await this.limpiarTemporal(f._id)) eliminados++;
    return { examinados: temporales.length, eliminados };
  }
}
