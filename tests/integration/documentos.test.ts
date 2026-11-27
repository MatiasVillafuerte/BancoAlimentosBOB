import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { test } from "node:test";
import { MongoClient, ObjectId, type Document } from "mongodb";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import type { UsuarioPublico } from "../../src/lib/auth/types";
import { ServicioRegistros } from "../../src/lib/registros/servicio";
import { ServicioInventario } from "../../src/lib/inventario/servicio";
import { ServicioDocumentos } from "../../src/lib/documentos/servicio";
import { VALIDACION_ARCHIVO, type EntidadDocumental } from "../../src/lib/documentos/modelo";

const require = createRequire(import.meta.url);
const { validadores, indices } = require("../../db/migraciones/modelo-v2.cjs") as {
  validadores: Record<string, Document>; indices: { coleccion: string; key: Document; options: Document }[]
};
const { esquemaAutenticacion } = require("../../db/esquema-autenticacion.cjs");
const uri = process.env.MONGODB_URI, oid = (s: string) => new ObjectId(s);
test("documentación y GridFS reales con revisión, permisos y concurrencia en una base aislada", { skip: !uri, timeout: 300000 }, async t => {
  const nombreBase = "bab_test_" + randomUUID().replaceAll("-", "").slice(0, 24);
  assert.match(nombreBase, /^bab_test_[a-f0-9]{24}$/);
  const cliente = new MongoClient(uri!, { serverSelectionTimeoutMS: 10000 }), bd = cliente.db(nombreBase);
  const ahora = new Date("2026-11-27T16:00:00Z");
  const registros = new ServicioRegistros(cliente, bd, () => ahora), inventario = new ServicioInventario(cliente, bd, () => ahora);
  const documentos = new ServicioDocumentos(cliente, bd, () => ahora);
  let creada = false;
  async function cuenta(rol: UsuarioPublico["rol"]): Promise<UsuarioPublico> {
    const _id = new ObjectId(), datos = { nombre: "Persona ficticia", email: `${_id}@example.com`, telefono: "00000000", rol };
    await bd.collection("voluntarios").insertOne({ _id, ...datos, activo: true, modeloVersion: 2 });
    return { id: String(_id), ...datos };
  }
  const registro = async (entidad: EntidadDocumental, id: string) => (await bd.collection(entidad).findOne({ _id: oid(id) }))!;
  const envio = async (entidad: EntidadDocumental, id: string) => ({ claveOperacion: randomUUID(), versionDatos: (await registro(entidad, id)).versionDatos || 0 });
  const stock = async () => ({ lotes: await bd.collection("lotes").find({}).sort({ _id: 1 }).toArray(), movimientos: await bd.collection("movimientos").find({}).sort({ _id: 1 }).toArray() });
  const foto = await sharp({ create: { width: 20, height: 12, channels: 3, background: "green" } }).png().toBuffer();
  const pdfDoc = await PDFDocument.create(); pdfDoc.addPage([100, 100]); const pdf = Buffer.from(await pdfDoc.save());
  try {
    await cliente.connect();
    assert.equal((await cliente.db("admin").admin().listDatabases({ nameOnly: true, filter: { name: nombreBase } })).databases.length, 0);
    for (const [nombre, validator] of Object.entries(validadores)) {
      await bd.createCollection(nombre, { validator: nombre === "voluntarios" ? { $and: [validator, esquemaAutenticacion] } : validator }); creada = true;
    }
    for (const i of indices) await bd.collection(i.coleccion).createIndex(i.key, i.options);
    const admin = await cuenta("administrador"), coord = await cuenta("coordinador"), autor = await cuenta("voluntario"), otro = await cuenta("voluntario");
    const donante = await registros.crearDonante(autor, { claveOperacion: randomUUID(), nombre: "Donante ficticio", tipo: "persona", contacto: {}, activo: true });
    const org = await registros.crearOrganizacion(coord, { claveOperacion: randomUUID(), nombre: "Comedor ficticio", tipo: "comedor", direccion: "Dirección ficticia", zona: "Norte",
      responsable: { nombre: "Contacto ficticio", telefono: "00000000" }, poblacion: { ninos: 2, adultosMayores: 3, total: 10 }, activa: true });
    async function recepcion() {
      const r = await registros.recibir(autor, { claveOperacion: randomUUID(), donanteId: donante.id, fechaRecepcion: "2026-11-26T10:00",
        lotes: [{ producto: "Arroz de prueba", categoria: "no perecedero", unidad: "bolsa", cantidad: 200, zona: "Z1", conservacion: "ambiente" }] });
      return { id: r.id, lote: (await bd.collection("lotes").findOne({ donacionId: oid(r.id) }))! };
    }
    async function subir(entidad: EntidadDocumental, id: string, bytes = foto, u = autor, extra: Document = {}) {
      return documentos.subir(u, { ...await envio(entidad, id), entidad, entidadId: id, ...extra }, bytes, bytes === pdf ? "acta.pdf" : "evidencia.png");
    }
    async function listaParaRevision() {
      const r = await recepcion(); await subir("donaciones", r.id);
      await documentos.enviar(autor, "donaciones", r.id, await envio("donaciones", r.id)); return r;
    }
    const aprobar = async (id: string, entidad: "donaciones" | "entregas" = "donaciones") => documentos.revisar(admin, entidad, id,
      { ...await envio(entidad, id), decision: "aprobar", confirmacion: true });

    await t.test("recepción exige foto propia; varias evidencias originales sin modificar existencias", async () => {
      const r = await recepcion(), antes = await stock();
      await assert.rejects(documentos.enviar(autor, "donaciones", r.id, await envio("donaciones", r.id)), { status: 400 });
      await subir("donaciones", r.id, pdf);
      await assert.rejects(documentos.enviar(autor, "donaciones", r.id, await envio("donaciones", r.id)), { status: 400 });
      const a = await subir("donaciones", r.id, foto, autor, { loteId: String(r.lote._id), descripcion: "Etiqueta del lote" });
      const f = await documentos.obtenerArchivo(autor, a.archivoId!);
      assert.equal(String(f.metadata.subidoPor), autor.id); assert.equal(String(f.metadata.loteId), String(r.lote._id));
      const fragmentos: Buffer[] = []; for await (const b of documentos.almacen.bucket.openDownloadStream(f._id)) fragmentos.push(b);
      assert.deepEqual(Buffer.concat(fragmentos), foto);
      const vista = await documentos.detalle(autor, "donaciones", r.id);
      assert.equal(vista.archivos.length, 2); assert.deepEqual(vista.pendientes, []);
      assert.equal(JSON.stringify(vista).includes("password"), false);
      await documentos.enviar(autor, "donaciones", r.id, await envio("donaciones", r.id));
      assert.equal((await registro("donaciones", r.id)).estado, "recibida");
      assert.deepEqual(await stock(), antes);
    });
    await t.test("lectura y escritura respetan el dueño de la operación y la cuenta vigente", async () => {
      const r = await recepcion(), a = await subir("donaciones", r.id);
      await assert.rejects(documentos.detalle(otro, "donaciones", r.id), { status: 404 });
      await assert.rejects(documentos.obtenerArchivo(otro, a.archivoId!), { status: 404 });
      await assert.rejects(subir("donaciones", r.id, foto, coord), { status: 404 });
      await assert.rejects(subir("donaciones", r.id, foto, { ...autor, rol: "administrador" }), { status: 403 });
      assert.equal((await documentos.obtenerArchivo(admin, a.archivoId!)).filename, "evidencia.png");
      const ajeno = await recepcion();
      await assert.rejects(subir("donaciones", r.id, foto, autor, { loteId: String(ajeno.lote._id) }), { status: 400 });
      await bd.collection("voluntarios").updateOne({ _id: oid(autor.id) }, { $set: { activo: false } });
      await assert.rejects(subir("donaciones", r.id), { status: 403 });
      await bd.collection("voluntarios").updateOne({ _id: oid(autor.id) }, { $set: { activo: true } });
    });
    await t.test("un identificador de foto ajena o una referencia incompleta no valida el expediente", async () => {
      const a = await recepcion(), b = await recepcion(), f = await subir("donaciones", a.id);
      await bd.collection("donaciones").updateOne({ _id: oid(b.id) }, { $set: { archivos: [oid(f.archivoId!)] } });
      const vista = await documentos.detalle(autor, "donaciones", b.id);
      assert.equal(vista.archivos.length, 0); assert.equal(vista.referenciasNoDisponibles, 1);
      await assert.rejects(documentos.enviar(autor, "donaciones", b.id, await envio("donaciones", b.id)), { status: 400 });
      await bd.collection("donaciones").updateOne({ _id: oid(b.id) }, { $set: { archivos: [] } });
    });
    await t.test("una evidencia legada se puede retirar con motivo, sin validarla ni borrar sus bytes", async () => {
      const r = await recepcion(), id = new ObjectId();
      await documentos.almacen.cargar(id, "anterior.png", foto, { entidad: "donaciones", entidadId: oid(r.id), tipo: "foto", subidoPor: oid(autor.id), mimeType: "image/png" });
      await bd.collection("donaciones").updateOne({ _id: oid(r.id) }, { $set: { archivos: [id] } });
      await assert.rejects(documentos.enviar(autor, "donaciones", r.id, await envio("donaciones", r.id)), { status: 400 });
      await assert.rejects(documentos.obtenerArchivo(autor, String(id)), { status: 404 });
      await documentos.retirar(autor, String(id), { ...await envio("donaciones", r.id), motivo: "Reemplazar copia anterior sin validación" });
      assert.equal((await bd.collection("fs.files").findOne({ _id: id }))?.metadata.estado, "retirado");
      assert.equal(await bd.collection("fs.chunks").countDocuments({ files_id: id }), 1);
      await subir("donaciones", r.id);
      await documentos.enviar(autor, "donaciones", r.id, await envio("donaciones", r.id));
      assert.equal((await registro("donaciones", r.id)).estado, "recibida");
    });
    await t.test("reintento simultáneo guarda una evidencia y limpia la carga sobrante", async () => {
      const r = await recepcion(), datos = { ...await envio("donaciones", r.id), entidad: "donaciones", entidadId: r.id };
      const resultados = await Promise.all([documentos.subir(autor, datos, foto, "foto.png"), documentos.subir(autor, datos, foto, "foto.png")]);
      assert.equal(new Set(resultados.map(v => v.archivoId)).size, 1);
      assert.equal(resultados.filter(v => !v.repetida).length, 1);
      assert.equal(await bd.collection("fs.files").countDocuments({ "metadata.entidadId": oid(r.id) }), 1);
      assert.equal((await registro("donaciones", r.id)).archivos.length, 1);
      assert.equal((await documentos.subir(autor, datos, foto, "foto.png")).repetida, true);
      await assert.rejects(documentos.subir(autor, { ...datos, descripcion: "Otro contenido" }, foto, "foto.png"), { status: 409 });
    });
    await t.test("dos cargas de la misma versión no se pisan y el intento rechazado se elimina", async () => {
      const r = await recepcion(), base = { versionDatos: 1, entidad: "donaciones", entidadId: r.id };
      const rs = await Promise.allSettled([documentos.subir(autor, { ...base, claveOperacion: randomUUID() }, foto, "a.png"),
        documentos.subir(admin, { ...base, claveOperacion: randomUUID() }, foto, "b.png")]);
      assert.equal(rs.filter(v => v.status === "fulfilled").length, 1);
      assert.equal((rs.find(v => v.status === "rejected") as PromiseRejectedResult).reason.status, 409);
      assert.equal(await bd.collection("fs.files").countDocuments({ "metadata.entidadId": oid(r.id) }), 1);
    });
    await t.test("fallo al escribir fragmentos o al vincular no deja una evidencia utilizable", async () => {
      const id = new ObjectId();
      await bd.collection("fs.chunks").insertOne({ files_id: id, n: 1, data: Buffer.from("conflicto de prueba") });
      await assert.rejects(documentos.almacen.cargar(id, "prueba.bin", Buffer.alloc(600000), { estado: "temporal", validacion: VALIDACION_ARCHIVO }));
      assert.equal(await bd.collection("fs.files").countDocuments({ _id: id }), 0);
      assert.equal(await bd.collection("fs.chunks").countDocuments({ files_id: id }), 0);
      const r = await recepcion(), original = documentos.almacen.cargar.bind(documentos.almacen);
      documentos.almacen.cargar = async (...args) => { await original(...args); await bd.collection("donaciones").updateOne({ _id: oid(r.id) }, { $inc: { versionDatos: 1 } }); };
      try { await assert.rejects(subir("donaciones", r.id), { status: 409 }); }
      finally { documentos.almacen.cargar = original; }
      assert.equal(await bd.collection("fs.files").countDocuments({ "metadata.entidadId": oid(r.id) }), 0);
      assert.deepEqual((await registro("donaciones", r.id)).archivos, []);
    });
    await t.test("observación, corrección, reenvío y aprobación manual no modifican el inventario", async () => {
      const r = await listaParaRevision(), antes = await stock(), versionInicial = (await registro("donaciones", r.id)).versionDatos;
      const observar = { ...await envio("donaciones", r.id), decision: "observar", confirmacion: true, observacion: "Aclara qué muestra la etiqueta." };
      await assert.rejects(documentos.revisar(coord, "donaciones", r.id, observar), { status: 403 });
      await documentos.revisar(admin, "donaciones", r.id, observar);
      assert.equal((await registro("donaciones", r.id)).estado, "observada");
      await documentos.corregir(autor, "donaciones", r.id, { ...await envio("donaciones", r.id), motivo: "Respuesta a la observación", observaciones: "La etiqueta corresponde al arroz recibido." });
      const corregida = await registro("donaciones", r.id);
      assert.equal(corregida.estado, "observada"); assert.equal(corregida.revision.observacion, observar.observacion);
      await documentos.enviar(autor, "donaciones", r.id, await envio("donaciones", r.id));
      await assert.rejects(documentos.revisar(admin, "donaciones", r.id, { claveOperacion: randomUUID(), versionDatos: versionInicial, decision: "aprobar", confirmacion: true }), { status: 409 });
      const datos = { ...await envio("donaciones", r.id), decision: "aprobar", confirmacion: true };
      const aprobaciones = await Promise.all([documentos.revisar(admin, "donaciones", r.id, datos), documentos.revisar(admin, "donaciones", r.id, datos)]);
      assert.equal(aprobaciones.filter(r => !r.repetida).length, 1);
      const final = await registro("donaciones", r.id);
      assert.equal(final.estado, "completada"); assert.equal(final.revision.versionRevisada, final.versionDatos);
      assert.equal(String(final.revision.revisadaPor), admin.id); assert.equal(String(final.registradaPor), autor.id);
      assert.deepEqual(await stock(), antes);
    });
    await t.test("reapertura exige admin y motivo, conserva la aprobación y permite una nueva revisión", async () => {
      const r = await listaParaRevision(); await aprobar(r.id);
      const antes = await stock(), aprobada = await registro("donaciones", r.id), archivoId = String(aprobada.archivos[0]);
      await assert.rejects(subir("donaciones", r.id), { status: 409 });
      await assert.rejects(documentos.retirar(autor, archivoId, { ...await envio("donaciones", r.id), motivo: "Corrección" }), { status: 409 });
      const datos = { ...await envio("donaciones", r.id), motivo: "Actualizar comprobante" };
      await assert.rejects(documentos.reabrir(coord, "donaciones", r.id, datos), { status: 403 });
      await documentos.reabrir(admin, "donaciones", r.id, datos);
      const reabierta = await registro("donaciones", r.id);
      assert.equal(reabierta.estado, "por_documentar"); assert.deepEqual(reabierta.revision, {});
      assert.deepEqual(reabierta.historial.at(-1).revisionAnterior, aprobada.revision);
      await subir("donaciones", r.id, pdf);
      await documentos.enviar(autor, "donaciones", r.id, await envio("donaciones", r.id)); await aprobar(r.id);
      assert.deepEqual(await stock(), antes);
    });
    await t.test("retirar conserva bytes e historial, y devuelve a por documentar si esperaba revisión", async () => {
      const r = await listaParaRevision(), d = await registro("donaciones", r.id), id = String(d.archivos[0]);
      const retiro = { ...await envio("donaciones", r.id), motivo: "La imagen no es legible" };
      await documentos.retirar(autor, id, retiro);
      assert.equal((await documentos.retirar(autor, id, retiro)).repetida, true);
      const vista = await documentos.detalle(autor, "donaciones", r.id);
      assert.equal(vista.estado, "por_documentar"); assert.equal(vista.archivos.length, 0); assert.equal(vista.retirados.length, 1);
      assert.equal((await documentos.obtenerArchivo(autor, id)).metadata.estado, "retirado");
      await assert.rejects(documentos.obtenerArchivo(otro, id), { status: 404 });
      await assert.rejects(documentos.enviar(autor, "donaciones", r.id, await envio("donaciones", r.id)), { status: 400 });
      assert.equal(await documentos.almacen.limpiarTemporal(oid(id)), false);
    });
    await t.test("una aprobación concurrente con un archivo nuevo nunca aprueba una versión desactualizada", async () => {
      const r = await listaParaRevision(), versionDatos = (await registro("donaciones", r.id)).versionDatos;
      const rs = await Promise.allSettled([documentos.revisar(admin, "donaciones", r.id, { claveOperacion: randomUUID(), versionDatos, decision: "aprobar", confirmacion: true }),
        documentos.subir(autor, { claveOperacion: randomUUID(), versionDatos, entidad: "donaciones", entidadId: r.id }, pdf, "acta.pdf")]);
      assert.equal(rs.filter(r => r.status === "fulfilled").length, 1);
      const d = await registro("donaciones", r.id);
      if (d.estado === "completada") assert.equal(d.revision.versionRevisada, d.versionDatos);
      else { assert.equal(d.estado, "por_documentar"); assert.deepEqual(d.revision, {}); }
      assert.equal(await bd.collection("fs.files").countDocuments({ "metadata.entidadId": oid(r.id) }), d.archivos.length);
    });
    await t.test("entrega conserva reservas hasta confirmar; documentar y corregir datos no repite la salida", async () => {
      const r = await recepcion();
      const e = await inventario.programar(coord, { claveOperacion: randomUUID(), organizacionId: org.id, responsablePrevistoId: autor.id,
        fechaProgramada: "2026-11-27T12:00", lugar: "Comedor", beneficiariosPrevistos: 10, items: [{ loteId: String(r.lote._id), cantidad: 100 }] });
      await subir("entregas", e.id, pdf); assert.equal((await registro("entregas", e.id)).estado, "programada");
      await assert.rejects(documentos.enviar(autor, "entregas", e.id, await envio("entregas", e.id)), { status: 409 });
      assert.equal((await bd.collection("lotes").findOne({ _id: r.lote._id }))?.cantidadEnBodega, 200);
      await inventario.confirmar(autor, e.id, { ...await envio("entregas", e.id), fechaEntrega: "2026-11-27T12:00", lugar: "Comedor", recibidoPor: "Ana",
        beneficiariosAtendidos: 10, items: [{ loteId: String(r.lote._id), cantidad: 80 }] });
      const antes = await stock();
      await subir("entregas", e.id);
      await documentos.corregir(autor, "entregas", e.id, { ...await envio("entregas", e.id), lugar: "Comedor Norte", recibidoPor: "Ana Pérez", beneficiariosAtendidos: 12,
        observaciones: "Entrega de la mañana", motivo: "Completar apellido y atenciones" });
      await documentos.enviar(autor, "entregas", e.id, await envio("entregas", e.id)); await aprobar(e.id, "entregas");
      const final = await registro("entregas", e.id);
      assert.equal(final.estado, "completada"); assert.equal(final.items[0].cantidadEntregada, 80);
      assert.equal(final.recibidoPor, "Ana Pérez"); assert.equal(String(final.registradaPor), coord.id); assert.equal(String(final.entregadaPor), autor.id);
      assert.deepEqual(await stock(), antes);
    });
    await t.test("cada versión del convenio admite un PDF original sin reemplazar el anterior", async () => {
      const datos = { claveOperacion: randomUUID(), donanteId: donante.id, nombre: "Convenio ficticio", desde: "2026-01-01", hasta: "2026-12-31", condiciones: "Condiciones ficticias" };
      const c = await registros.crearConvenio(coord, datos);
      await assert.rejects(subir("convenios", c.id, pdf, autor), { status: 403 });
      await assert.rejects(subir("convenios", c.id, foto, coord), { status: 400 });
      const a = await subir("convenios", c.id, pdf, coord), antes = await registro("convenios", c.id);
      await assert.rejects(subir("convenios", c.id, pdf, admin), { status: 409 });
      await assert.rejects(documentos.retirar(admin, a.archivoId!, { ...await envio("convenios", c.id), motivo: "Reemplazar" }), { status: 409 });
      const nueva = await registros.crearConvenio(coord, { ...datos, claveOperacion: randomUUID(), anteriorId: c.id, desde: "2026-06-01", condiciones: "Condiciones actualizadas" });
      await subir("convenios", nueva.id, pdf, admin);
      assert.deepEqual(await registro("convenios", c.id), antes);
      assert.notEqual(String((await registro("convenios", nueva.id)).pdfId), a.archivoId);
      assert.equal((await documentos.obtenerArchivo(autor, a.archivoId!)).metadata.tipo, "pdf");
    });
    await t.test("limpieza retira solo temporales propios antiguos sin referencias actuales ni históricas", async () => {
      const r = await recepcion(), anterior = new Date(Date.now() - 48 * 3600000);
      async function temporal(estado: string, viejo = true, propio = true) {
        const id = new ObjectId(); await documentos.almacen.cargar(id, "temporal.png", foto, { entidad: "donaciones", entidadId: oid(r.id), estado,
          ...(propio ? { validacion: VALIDACION_ARCHIVO } : {}) });
        if (viejo) await bd.collection("fs.files").updateOne({ _id: id }, { $set: { uploadDate: anterior } }); return id;
      }
      const eliminar = await temporal("temporal"), reciente = await temporal("temporal", false), ajeno = await temporal("temporal", true, false);
      const vinculado = await temporal("vinculado"), historico = await temporal("temporal");
      await bd.collection("donaciones").updateOne({ _id: oid(r.id) }, { $push: { historial: { accion: "archivo_retirado", usuarioId: oid(admin.id), fecha: ahora, archivoId: historico } } } as Document);
      const resultado = await documentos.almacen.limpiarAntiguos();
      assert.equal(resultado.eliminados, 1);
      assert.equal(await bd.collection("fs.files").countDocuments({ _id: eliminar }), 0);
      assert.equal(await bd.collection("fs.chunks").countDocuments({ files_id: eliminar }), 0);
      for (const id of [reciente, ajeno, vinculado, historico]) assert.equal(await bd.collection("fs.files").countDocuments({ _id: id }), 1);
      const huerfanos = await bd.collection("fs.chunks").aggregate([{ $lookup: { from: "fs.files", localField: "files_id", foreignField: "_id", as: "archivo" } },
        { $match: { archivo: { $size: 0 } } }, { $count: "cantidad" }]).toArray();
      assert.deepEqual(huerfanos, []);
    });
  } finally {
    try {
      if (creada) {
        assert.match(bd.databaseName, /^bab_test_[a-f0-9]{24}$/); assert.equal(bd.databaseName, nombreBase);
        for (const nombre of [...Object.keys(validadores), "fs.files", "fs.chunks"]) if (await bd.listCollections({ name: nombre }, { nameOnly: true }).hasNext()) await bd.collection(nombre).drop();
        console.log("Base temporal de documentación retirada; bab_donaciones no recibió escrituras de prueba.");
      }
    } finally { await cliente.close(); }
  }
});
