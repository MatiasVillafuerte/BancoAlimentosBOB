import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { test } from "node:test";
import { MongoClient, ObjectId, type Document } from "mongodb";
import { ServicioRegistros } from "../../src/lib/registros/servicio";
import { comprobarPassword } from "../../src/lib/auth/password";
import type { UsuarioPublico } from "../../src/lib/auth/types";

const require = createRequire(import.meta.url);
const { validadores, indices } = require("../../db/migraciones/modelo-v2.cjs") as {
  validadores: Record<string, Document>; indices: { coleccion: string; key: Document; options: Document }[]
};
const { esquemaAutenticacion } = require("../../db/esquema-autenticacion.cjs");
const uri = process.env.MONGODB_URI;

test("registro con transacciones reales y validadores v2, en una base temporal aislada", { skip: !uri, timeout: 180000 }, async t => {
  const nombreBase = "bab_test_" + randomUUID().replaceAll("-", "").slice(0, 24);
  assert.match(nombreBase, /^bab_test_[a-f0-9]{24}$/);
  const cliente = new MongoClient(uri!, { serverSelectionTimeoutMS: 10000 });
  const bd = cliente.db(nombreBase);
  const ahora = new Date("2026-11-27T16:00:00Z");
  const servicio = new ServicioRegistros(cliente, bd, () => ahora);
  let creada = false;
  const clave = () => randomUUID();
  async function cuenta(rol: UsuarioPublico["rol"], activo = true): Promise<UsuarioPublico> {
    const _id = new ObjectId();
    const u = { nombre: "Persona ficticia", email: `${_id}@example.com`, telefono: "00000000", rol };
    await bd.collection("voluntarios").insertOne({ _id, ...u, activo, modeloVersion: 2 });
    return { ...u, id: String(_id) };
  }
  const lote = { producto: "Arroz de prueba", categoria: "no perecedero", cantidad: 200, unidad: "bolsa", zona: "Z1", conservacion: "ambiente" };
  const datosDonante = () => ({ claveOperacion: clave(), nombre: "Donante ficticio", tipo: "persona", activo: true, contacto: {} });
  const datosOrganizacion = () => ({ claveOperacion: clave(), nombre: "Comedor ficticio", tipo: "comedor", direccion: "Dirección ficticia", zona: "Norte",
    responsable: { nombre: "Contacto ficticio", telefono: "00000000" }, poblacion: { ninos: 2, adultosMayores: 3, total: 10 }, activa: true });
  const baseUsuario = (u: UsuarioPublico, versionDatos = 0) => ({ nombre: u.nombre, email: u.email, telefono: u.telefono, rol: u.rol, activo: true, versionDatos });
  try {
    await cliente.connect();
    assert.equal((await cliente.db("admin").admin().listDatabases({ nameOnly: true, filter: { name: nombreBase } })).databases.length, 0);
    for (const [nombre, validator] of Object.entries(validadores)) {
      await bd.createCollection(nombre, { validator: nombre === "voluntarios" ? { $and: [validator, esquemaAutenticacion] } : validator });
      creada = true;
    }
    for (const idx of indices) await bd.collection(idx.coleccion).createIndex(idx.key, idx.options);
    const admin = await cuenta("administrador");
    const coord = await cuenta("coordinador");
    const voluntario = await cuenta("voluntario");
    const inactivo = await cuenta("voluntario", false);
    const donante = await servicio.crearDonante(voluntario, datosDonante());
    const recepcion = () => ({ claveOperacion: clave(), donanteId: donante.id, fechaRecepcion: "2026-11-26T10:00", lotes: [lote] });

    await t.test("donante ocasional y organización respetan validadores; no se insertan nulos opcionales", async () => {
      const doc = await bd.collection("donantes").findOne({ _id: new ObjectId(donante.id) });
      assert.ok(doc);
      assert.equal("nit" in doc, false); assert.deepEqual(doc.contacto, {});
      assert.equal(String(doc.registradaPor), voluntario.id);
      const org = await servicio.crearOrganizacion(coord, datosOrganizacion());
      assert.equal((await bd.collection("organizaciones").findOne({ _id: new ObjectId(org.id) }))?.poblacion.total, 10);
    });
    await t.test("permisos reales, cuentas desactivadas y rol falsificado", async () => {
      await assert.rejects(servicio.crearOrganizacion(voluntario, datosOrganizacion()), { status: 403 });
      await assert.rejects(servicio.crearDonante(voluntario, { ...datosDonante(), tipo: "empresa" }), { status: 403 });
      await assert.rejects(servicio.recibir(inactivo, recepcion()), { status: 403 });
      await assert.rejects(servicio.crearOrganizacion({ ...voluntario, rol: "administrador" }, datosOrganizacion()), { status: 403 });
    });
    await t.test("recepción, lotes y movimientos ingresan una sola vez ante envíos simultáneos", async () => {
      const d = { ...recepcion(), lotes: [lote, { ...lote, producto: "Lenteja", cantidad: 50, unidad: "caja" }] };
      const resultados = await Promise.all([servicio.recibir(voluntario, d), servicio.recibir(voluntario, d), servicio.recibir(voluntario, d)]);
      assert.equal(new Set(resultados.map(r => r.id)).size, 1);
      const _id = new ObjectId(resultados[0].id);
      assert.equal(await bd.collection("donaciones").countDocuments({ _id }), 1);
      const doc = await bd.collection("donaciones").findOne({ _id });
      assert.equal(doc?.estado, "por_documentar"); assert.deepEqual(doc?.archivos, []);
      assert.equal(String(doc?.registradaPor), voluntario.id); assert.equal(doc?.versionDatos, 1);
      assert.equal("pesoTotalKg" in doc!, false);
      const lotes = await bd.collection("lotes").find({ donacionId: _id }).toArray();
      assert.equal(lotes.length, 2);
      assert.equal(await bd.collection("movimientos").countDocuments({ loteId: { $in: lotes.map(l => l._id) } }), 2);
      for (const l of lotes) { assert.equal(l.cantidadEnBodega, l.cantidad); assert.equal(l.cantidadDisponible, l.cantidad); assert.equal(l.cantidadReservada, 0); }
      await assert.rejects(servicio.recibir(voluntario, { ...d, observaciones: "Contenido diferente" }), { status: 409 });
      assert.equal((await servicio.recibir(voluntario, d)).repetida, true);
    });
    await t.test("si falla un movimiento se revierten lote, donación y auditoría de la transacción", async () => {
      const d = recepcion();
      const id = createHash("sha256").update(JSON.stringify(["donaciones", voluntario.id, d.claveOperacion])).digest("hex").slice(0, 24);
      const existente = await bd.collection("movimientos").findOne({});
      const conflictoId = new ObjectId();
      await bd.collection("movimientos").insertOne({ ...existente!, _id: conflictoId, claveOperacion: `recepcion:${id}:0` });
      const antes = await bd.collection("lotes").countDocuments();
      const uso = (await bd.collection("donantes").findOne({ _id: new ObjectId(donante.id) }))?.versionUso;
      await assert.rejects(servicio.recibir(voluntario, d), { status: 409 });
      assert.equal(await bd.collection("donaciones").countDocuments({ _id: new ObjectId(id) }), 0);
      assert.equal(await bd.collection("lotes").countDocuments(), antes);
      assert.equal((await bd.collection("donantes").findOne({ _id: new ObjectId(donante.id) }))?.versionUso, uso);
      await bd.collection("movimientos").deleteOne({ _id: conflictoId });
      assert.equal((await servicio.recibir(voluntario, d)).repetida, false);
    });
    await t.test("rechaza fechas futuras y donantes inactivos, conserva lotes vencidos sin repartirlos", async () => {
      await assert.rejects(servicio.recibir(voluntario, { ...recepcion(), fechaRecepcion: "2026-11-28T10:00" }), { status: 400 });
      const inactivo = await servicio.crearDonante(admin, { ...datosDonante(), activo: false });
      await assert.rejects(servicio.recibir(voluntario, { ...recepcion(), donanteId: inactivo.id }), { status: 400 });
      const r = await servicio.recibir(voluntario, { ...recepcion(), lotes: [{ ...lote, fechaVencimiento: "2026-11-25", pesoKg: 20 }] });
      assert.equal((await bd.collection("lotes").findOne({ donacionId: new ObjectId(r.id) }))?.estado, "vencido");
      assert.equal((await bd.collection("donaciones").findOne({ _id: new ObjectId(r.id) }))?.pesoTotalKg, 20);
    });
    await t.test("versiones inmutables, donante correcto y versión aplicable a la fecha", async () => {
      const base = { claveOperacion: clave(), donanteId: donante.id, nombre: "Convenio ficticio", desde: "2026-01-01", hasta: "2026-12-31", condiciones: "Primera versión" };
      const v1 = await servicio.crearConvenio(coord, base);
      const original = await bd.collection("convenios").findOne({ _id: new ObjectId(v1.id) });
      const d2 = { ...base, claveOperacion: clave(), anteriorId: v1.id, desde: "2026-06-01", condiciones: "Segunda versión" };
      const simultaneas = await Promise.allSettled([servicio.crearConvenio(coord, d2), servicio.crearConvenio(admin, { ...d2, claveOperacion: clave() })]);
      assert.equal(simultaneas.filter(r => r.status === "fulfilled").length, 1);
      const v2 = await bd.collection("convenios").findOne({ codigo: original?.codigo, version: 2 });
      assert.ok(v2);
      assert.deepEqual(await bd.collection("convenios").findOne({ _id: new ObjectId(v1.id) }), original);
      await assert.rejects(servicio.recibir(voluntario, { ...recepcion(), convenioId: v1.id }), { status: 400 });
      const anterior = await servicio.recibir(voluntario, { ...recepcion(), fechaRecepcion: "2026-03-01T10:00", convenioId: v1.id });
      assert.ok(anterior.id);
      const correcta = await servicio.recibir(voluntario, { ...recepcion(), convenioId: String(v2._id) });
      assert.equal(String((await bd.collection("donaciones").findOne({ _id: new ObjectId(correcta.id) }))?.convenioId), String(v2._id));
      const otro = await servicio.crearDonante(admin, datosDonante());
      await assert.rejects(servicio.recibir(voluntario, { ...recepcion(), donanteId: otro.id, convenioId: String(v2._id) }), { status: 400 });
      await assert.rejects(servicio.crearConvenio(coord, { ...d2, claveOperacion: clave() }), { status: 409 });
    });
    await t.test("edición detecta conflictos y conserva nombres históricos de las donaciones", async () => {
      const nuevo = await servicio.crearDonante(coord, { ...datosDonante(), nit: "123", contacto: { nombre: "Contacto" } });
      const r = await servicio.recibir(voluntario, { ...recepcion(), donanteId: nuevo.id });
      const editar = { nombre: "Nombre actualizado", tipo: "persona", activo: true, contacto: {}, versionDatos: 1 };
      await servicio.editarCatalogo(coord, "donantes", nuevo.id, editar);
      await assert.rejects(servicio.editarCatalogo(admin, "donantes", nuevo.id, editar), { status: 409 });
      const doc = await bd.collection("donantes").findOne({ _id: new ObjectId(nuevo.id) });
      assert.equal(doc?.nombre, editar.nombre); assert.equal("nit" in doc!, false);
      assert.equal((await bd.collection("donaciones").findOne({ _id: new ObjectId(r.id) }))?.donante.nombre, "Donante ficticio");
    });
    await t.test("cuenta nueva con hash Argon2id, correo único y reintento sin cambiar contraseña", async () => {
      const passwordInicial = "Contraseña ficticia de prueba 2026";
      const d = { claveOperacion: clave(), nombre: "Cuenta ficticia", email: "NUEVA@EXAMPLE.COM", telefono: "00000000", rol: "voluntario", activo: true, passwordInicial };
      const u = await servicio.crearUsuario(admin, d);
      const doc = await bd.collection("voluntarios").findOne({ _id: new ObjectId(u.id) });
      assert.ok(doc);
      assert.equal(doc.email, "nueva@example.com");
      assert.ok(await comprobarPassword(doc.passwordHash, passwordInicial));
      assert.equal(JSON.stringify(doc).includes(passwordInicial), false);
      assert.equal((await servicio.crearUsuario(admin, { ...d, passwordInicial: "Otra contraseña de prueba 2026" })).repetida, true);
      assert.equal((await bd.collection("voluntarios").findOne({ _id: doc._id }))?.passwordHash, doc.passwordHash);
      await assert.rejects(servicio.crearUsuario(admin, { ...d, claveOperacion: clave() }), { status: 409 });
      await assert.rejects(servicio.crearUsuario(coord, d), { status: 403 });
    });
    await t.test("habilita cuentas sin hash y revoca sesiones al cambiar permisos sin restablecer claves", async () => {
      const u = await cuenta("voluntario");
      await servicio.editarUsuario(admin, u.id, { ...baseUsuario(u), passwordInicial: "Contraseña ficticia inicial 2026" });
      const doc = await bd.collection("voluntarios").findOne({ _id: new ObjectId(u.id) });
      assert.ok(doc?.passwordHash);
      await assert.rejects(servicio.editarUsuario(admin, u.id, { ...baseUsuario(u, 1), passwordInicial: "No debe reemplazarse esta clave" }), { status: 409 });
      await bd.collection("voluntarios").updateOne({ _id: new ObjectId(u.id) }, { $set: { sesiones: [{ tokenHash: "a".repeat(64), creadaEn: ahora, expiraEn: new Date(ahora.getTime() + 60000) }] } });
      await servicio.editarUsuario(admin, u.id, { ...baseUsuario(u, 1), rol: "coordinador" });
      const despues = await bd.collection("voluntarios").findOne({ _id: new ObjectId(u.id) });
      assert.deepEqual(despues?.sesiones, []); assert.equal(despues?.passwordHash, doc.passwordHash);
      await assert.rejects(servicio.recibir(u, recepcion()), { status: 403 });
    });
    await t.test("dos administradores no pueden desactivarse simultáneamente y dejar ambos accesos cerrados", async () => {
      const a = await cuenta("administrador"); const b = await cuenta("administrador");
      await assert.rejects(servicio.editarUsuario(a, a.id, { ...baseUsuario(a), activo: false }), { status: 400 });
      const r = await Promise.allSettled([
        servicio.editarUsuario(a, b.id, { ...baseUsuario(b), activo: false }),
        servicio.editarUsuario(b, a.id, { ...baseUsuario(a), activo: false })
      ]);
      assert.equal(r.filter(v => v.status === "fulfilled").length, 1);
      assert.equal(await bd.collection("voluntarios").countDocuments({ _id: { $in: [new ObjectId(a.id), new ObjectId(b.id)] }, activo: true }), 1);
    });
  } finally {
    try {
      if (creada) {
        assert.match(bd.databaseName, /^bab_test_[a-f0-9]{24}$/);
        assert.equal(bd.databaseName, nombreBase);
        // readWrite permite retirar las colecciones propias; dropDatabase exige permisos adicionales.
        for (const nombre of Object.keys(validadores)) {
          if (await bd.listCollections({ name: nombre }, { nameOnly: true }).hasNext()) await bd.collection(nombre).drop();
        }
        console.log("Base temporal de pruebas eliminada; no se escribieron datos en bab_donaciones.");
      }
    } finally { await cliente.close(); }
  }
});
