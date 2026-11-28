import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { test } from "node:test";
import { MongoClient, ObjectId, type Document } from "mongodb";
import sharp from "sharp";
import type { UsuarioPublico } from "../../src/lib/auth/types";
import { ServicioRegistros } from "../../src/lib/registros/servicio";
import { ServicioInventario } from "../../src/lib/inventario/servicio";
import { ServicioDocumentos } from "../../src/lib/documentos/servicio";
import { ConsultasInformes } from "../../src/lib/informes/consultas";

const require = createRequire(import.meta.url);
const { validadores, indices } = require("../../db/migraciones/modelo-v2.cjs") as {
  validadores: Record<string, Document>; indices: { coleccion: string; key: Document; options: Document }[] };
const { esquemaAutenticacion } = require("../../db/esquema-autenticacion.cjs");
const uri = process.env.MONGODB_URI, oid = (s: string) => new ObjectId(s);
test("recorrido final real desde recepción hasta informe, sin escribir en bab_donaciones", { skip: !uri, timeout: 300000 }, async t => {
  const nombreBase = "bab_test_" + randomUUID().replaceAll("-", "").slice(0, 24);
  assert.match(nombreBase, /^bab_test_[a-f0-9]{24}$/);
  const cliente = new MongoClient(uri!, { serverSelectionTimeoutMS: 10000 }), bd = cliente.db(nombreBase);
  let ahora = new Date("2026-11-27T16:00:00Z"), creada = false;
  const registros = new ServicioRegistros(cliente, bd, () => ahora), inventario = new ServicioInventario(cliente, bd, () => ahora);
  const docs = new ServicioDocumentos(cliente, bd, () => ahora), informes = new ConsultasInformes(cliente, bd, () => ahora);
  const foto = await sharp({ create: { width: 20, height: 12, channels: 3, background: "green" } }).png().toBuffer();
  async function cuenta(rol: UsuarioPublico["rol"]): Promise<UsuarioPublico> {
    const _id = new ObjectId(), datos = { nombre: "Persona ficticia", email: `${_id}@example.com`, telefono: "00000000", rol };
    await bd.collection("voluntarios").insertOne({ _id, ...datos, activo: true, modeloVersion: 2 }); return { id: String(_id), ...datos };
  }
  const doc = async (tipo: string, id: string) => (await bd.collection(tipo).findOne({ _id: oid(id) }))!;
  const envio = async (tipo: string, id: string) => ({ claveOperacion: randomUUID(), versionDatos: (await doc(tipo, id)).versionDatos });
  const periodo = new URLSearchParams("desde=2026-11-26&hasta=2026-11-27");
  try {
    await cliente.connect();
    assert.equal((await cliente.db("admin").admin().listDatabases({ nameOnly: true, filter: { name: nombreBase } })).databases.length, 0);
    for (const [nombre, validator] of Object.entries(validadores)) { await bd.createCollection(nombre, { validator: nombre === "voluntarios" ? { $and: [validator, esquemaAutenticacion] } : validator }); creada = true; }
    for (const i of indices) await bd.collection(i.coleccion).createIndex(i.key, i.options);
    const admin = await cuenta("administrador"), coord = await cuenta("coordinador"), autor = await cuenta("voluntario"), otro = await cuenta("voluntario");
    const donante = await registros.crearDonante(autor, { claveOperacion: randomUUID(), nombre: "Donante ficticio", tipo: "persona", contacto: {}, activo: true });
    const org = await registros.crearOrganizacion(coord, { claveOperacion: randomUUID(), nombre: "Comedor ficticio", tipo: "comedor", direccion: "Dirección ficticia", zona: "Norte",
      responsable: { nombre: "Contacto ficticio", telefono: "00000000" }, poblacion: { ninos: 2, adultosMayores: 3, total: 10 }, activa: true });
    const r = await registros.recibir(autor, { claveOperacion: randomUUID(), donanteId: donante.id, fechaRecepcion: "2026-11-26T10:00",
      lotes: [{ producto: "Arroz ficticio", categoria: "no perecedero", unidad: "bolsa", cantidad: 200, zona: "Z1", conservacion: "ambiente" }] });
    const lote = (await bd.collection("lotes").findOne({ donacionId: oid(r.id) }))!;
    const plan = { organizacionId: org.id, fechaProgramada: "2026-11-27T12:30", lugar: "Sede ficticia", responsablePrevistoId: autor.id,
      beneficiariosPrevistos: 20, items: [{ loteId: String(lote._id), cantidad: 100 }] };
    let entregaId = "", codigo = "";
    await t.test("recepción ocasional, evidencia, observación, corrección y aprobación", async () => {
      const antes = (await informes.resumen(admin, periodo)).secciones[0];
      assert.equal(antes.operaciones, 1); assert.equal(antes.aprobadas, 0); assert.equal(antes.cantidades[0].neta, 200); assert.equal(antes.pesoKgRegistrado, null);
      await docs.subir(autor, { ...await envio("donaciones", r.id), entidad: "donaciones", entidadId: r.id }, foto, "recepcion.png");
      await docs.enviar(autor, "donaciones", r.id, await envio("donaciones", r.id));
      await docs.revisar(admin, "donaciones", r.id, { ...await envio("donaciones", r.id), decision: "observar", confirmacion: true, observacion: "Aclarar el contenido" });
      await docs.corregir(autor, "donaciones", r.id, { ...await envio("donaciones", r.id), motivo: "Respuesta al administrador", observaciones: "Arroz recibido en bolsas" });
      await docs.enviar(autor, "donaciones", r.id, await envio("donaciones", r.id));
      await docs.revisar(admin, "donaciones", r.id, { ...await envio("donaciones", r.id), decision: "aprobar", confirmacion: true });
      assert.equal((await informes.resumen(admin, periodo)).secciones[0].aprobadas, 1);
      assert.equal((await doc("donaciones", r.id)).convenioId, undefined);
    });
    await t.test("reserva 100 de 200, rechaza 120 adicionales y confirma 80 una sola vez", async () => {
      const e = await inventario.programar(coord, { ...plan, claveOperacion: randomUUID() }); entregaId = e.id; codigo = (await doc("entregas", e.id)).codigo;
      assert.equal((await informes.resumen(admin, periodo)).secciones[1].operaciones, 0);
      await assert.rejects(inventario.programar(coord, { ...plan, claveOperacion: randomUUID(), items: [{ loteId: String(lote._id), cantidad: 120 }] }), { status: 409 });
      ahora = new Date("2026-11-27T17:00:00Z");
      const confirmar = { ...await envio("entregas", e.id), fechaEntrega: "2026-11-27T12:30", recibidoPor: "Responsable ficticio", lugar: plan.lugar,
        beneficiariosAtendidos: 20, items: [{ loteId: String(lote._id), cantidad: 80, pesoKg: 40 }] };
      await inventario.confirmar(autor, e.id, confirmar); assert.equal((await inventario.confirmar(autor, e.id, confirmar)).repetida, true);
      const saldo = await bd.collection("lotes").findOne({ _id: lote._id }); assert.equal(saldo?.cantidadEnBodega, 120); assert.equal(saldo?.cantidadReservada, 0);
      const informe = (await informes.resumen(admin, periodo)).secciones[1];
      assert.equal(informe.operaciones, 1); assert.equal(informe.aprobadas, 0); assert.equal(informe.atenciones, 20); assert.equal(informe.pesoKgRegistrado, 40);
    });
    await t.test("evidencia y aprobación de entrega; trazabilidad respeta autoría", async () => {
      await docs.subir(autor, { ...await envio("entregas", entregaId), entidad: "entregas", entidadId: entregaId }, foto, "entrega.png");
      await docs.enviar(autor, "entregas", entregaId, await envio("entregas", entregaId));
      await docs.revisar(admin, "entregas", entregaId, { ...await envio("entregas", entregaId), decision: "aprobar", confirmacion: true });
      assert.equal((await informes.resumen(admin, periodo)).secciones[1].aprobadas, 1);
      const traza = await informes.trazabilidad(autor, codigo); assert.equal(traza?.lineas[0].donacion?.id, r.id); assert.equal(traza?.lineas[0].cantidades?.neta, 80);
      assert.equal((await informes.trazabilidad(coord, codigo))?.lineas[0].donacion, null);
      assert.equal(await informes.trazabilidad(otro, codigo), null);
      assert.equal((await informes.resumen(otro, periodo)).secciones.every(s => s.operaciones === 0), true);
      assert.equal((await informes.resumen(coord, periodo)).secciones[0].operaciones, 0);
    });
    await t.test("devolución posterior se atribuye al origen sin alterar aprobación ni peso medido", async () => {
      ahora = new Date("2026-11-28T16:00:00Z");
      const original = (await bd.collection("movimientos").findOne({ entregaId: oid(entregaId), tipo: "entrega" }))!;
      await inventario.registrarMovimiento(coord, { claveOperacion: randomUUID(), loteId: String(lote._id), tipo: "devolucionEntrada", cantidad: 10,
        origenId: String(original._id), reincorporar: true, motivo: "Devolución ficticia de bolsas sin utilizar" });
      const s = (await informes.resumen(admin, periodo)).secciones[1];
      assert.equal(s.cantidades[0].neta, 70); assert.equal(s.cantidades[0].devuelta, 10); assert.equal(s.aprobadas, 1); assert.equal(s.pesoKgRegistrado, 40);
      const vacio = await informes.resumen(admin, new URLSearchParams("desde=2026-11-28&hasta=2026-11-28"));
      assert.equal(vacio.secciones[1].operaciones, 0);
      await bd.collection("voluntarios").updateOne({ _id: oid(otro.id) }, { $set: { activo: false } });
      await assert.rejects(informes.resumen(otro, periodo), { status: 403 });
    });
  } finally {
    try { if (creada) {
      assert.match(bd.databaseName, /^bab_test_[a-f0-9]{24}$/); assert.equal(bd.databaseName, nombreBase);
      for (const nombre of [...Object.keys(validadores), "fs.files", "fs.chunks"]) if (await bd.listCollections({ name: nombre }, { nameOnly: true }).hasNext()) await bd.collection(nombre).drop();
      console.log("Base temporal del recorrido final retirada.");
    } } finally { await cliente.close(); }
  }
});
