import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { test } from "node:test";
import { MongoClient, ObjectId, type Document } from "mongodb";
import type { UsuarioPublico } from "../../src/lib/auth/types";
import { ServicioRegistros } from "../../src/lib/registros/servicio";
import { ServicioInventario } from "../../src/lib/inventario/servicio";
import { ConsultasInventario } from "../../src/lib/inventario/lecturas";
import { filtroOperacion, leerFiltros } from "../../src/lib/operaciones/modelo";
const require = createRequire(import.meta.url);
const { validadores, indices } = require("../../db/migraciones/modelo-v2.cjs") as {
  validadores: Record<string, Document>; indices: { coleccion: string; key: Document; options: Document }[]
};
const { esquemaAutenticacion } = require("../../db/esquema-autenticacion.cjs");
const uri = process.env.MONGODB_URI;
const oid = (s: string) => new ObjectId(s);
const local = (d: Date) => new Date(d.getTime() - 4 * 3600000).toISOString().slice(0, 16);

test("inventario y entregas con transacciones reales en una base temporal aislada", { skip: !uri, timeout: 300000 }, async t => {
  const nombreBase = "bab_test_" + randomUUID().replaceAll("-", "").slice(0, 24);
  assert.match(nombreBase, /^bab_test_[a-f0-9]{24}$/);
  const cliente = new MongoClient(uri!, { serverSelectionTimeoutMS: 10000 });
  const bd = cliente.db(nombreBase);
  let ahora = new Date("2026-11-27T16:00:00Z"), creada = false;
  const registros = new ServicioRegistros(cliente, bd, () => ahora);
  const servicio = new ServicioInventario(cliente, bd, () => ahora);
  const consultas = new ConsultasInventario(bd, () => ahora);
  async function cuenta(rol: UsuarioPublico["rol"]): Promise<UsuarioPublico> {
    const _id = new ObjectId(), datos = { nombre: "Persona ficticia", email: `${_id}@example.com`, telefono: "00000000", rol };
    await bd.collection("voluntarios").insertOne({ _id, ...datos, activo: true, modeloVersion: 2 });
    return { id: String(_id), ...datos };
  }
  try {
    await cliente.connect();
    assert.equal((await cliente.db("admin").admin().listDatabases({ nameOnly: true, filter: { name: nombreBase } })).databases.length, 0);
    for (const [nombre, validator] of Object.entries(validadores)) {
      await bd.createCollection(nombre, { validator: nombre === "voluntarios" ? { $and: [validator, esquemaAutenticacion] } : validator }); creada = true;
    }
    for (const i of indices) await bd.collection(i.coleccion).createIndex(i.key, i.options);
    const admin = await cuenta("administrador"), coord = await cuenta("coordinador"), voluntario = await cuenta("voluntario"), otro = await cuenta("voluntario");
    const donante = await registros.crearDonante(voluntario, { claveOperacion: randomUUID(), nombre: "Donante ficticio", tipo: "persona", contacto: {}, activo: true });
    const org = await registros.crearOrganizacion(coord, { claveOperacion: randomUUID(), nombre: "Comedor ficticio", tipo: "comedor", direccion: "Dirección de prueba", zona: "Norte",
      responsable: { nombre: "Contacto ficticio", telefono: "00000000" }, poblacion: { ninos: 2, adultosMayores: 3, total: 10 }, activa: true });
    async function nuevoLote(extra: Document = {}) {
      const r = await registros.recibir(voluntario, { claveOperacion: randomUUID(), donanteId: donante.id, fechaRecepcion: "2026-11-26T10:00",
        lotes: [{ producto: "Arroz de prueba", categoria: "no perecedero", unidad: "bolsa", cantidad: 200, zona: "Z1", conservacion: "ambiente", ...extra }] });
      return (await bd.collection("lotes").findOne({ donacionId: oid(r.id) }))!;
    }
    const plan = (l: Document, cantidad: number, extra: Document = {}) => ({ claveOperacion: randomUUID(), organizacionId: org.id, responsablePrevistoId: voluntario.id,
      fechaProgramada: local(ahora), lugar: "Lugar de prueba", beneficiariosPrevistos: 10, items: [{ loteId: String(l._id), cantidad }], ...extra });
    const confirmacion = (l: Document, cantidad: number, extra: Document = {}) => ({ claveOperacion: randomUUID(), versionDatos: 1, fechaEntrega: local(ahora),
      recibidoPor: "Contacto ficticio", lugar: "Lugar de prueba", beneficiariosAtendidos: 8, items: [{ loteId: String(l._id), cantidad }], ...extra });
    const movimiento = (l: Document, tipo: string, cantidad: number, extra: Document = {}) => ({ claveOperacion: randomUUID(), loteId: String(l._id), tipo, cantidad, motivo: "Caso ficticio de prueba", ...extra });
    const entrega = (id: string) => bd.collection("entregas").findOne({ _id: oid(id) });
    async function saldos(l: Document, fisico: number, reservado: number) {
      const d = (await consultas.detalle(admin, String(l._id)))!;
      assert.equal(d.lote.enBodega, fisico); assert.equal(d.lote.reservada, reservado); assert.equal(d.conciliado, true);
      assert.equal((await bd.collection("lotes").findOne({ _id: l._id }))?.cantidadDisponible, fisico);
    }
    async function salida(l: Document, cantidad = 80) {
      const e = await servicio.programar(coord, plan(l, 100));
      await servicio.confirmar(voluntario, e.id, confirmacion(l, cantidad));
      const m = (await bd.collection("movimientos").findOne({ entregaId: oid(e.id), tipo: "entrega" }))!;
      return { e, m };
    }
    await t.test("200 unidades no admiten reservas concurrentes de 100 y 120", async () => {
      const l = await nuevoLote();
      const r = await Promise.allSettled([servicio.programar(coord, plan(l, 100)), servicio.programar(admin, plan(l, 120))]);
      assert.equal(r.filter(v => v.status === "fulfilled").length, 1);
      const fallida = r.find(v => v.status === "rejected") as PromiseRejectedResult;
      assert.equal(fallida.reason.status, 409);
      const res = r.find(v => v.status === "fulfilled") as PromiseFulfilledResult<{ id: string }>;
      await saldos(l, 200, (await entrega(res.value.id))!.items[0].cantidadReservada);
      assert.equal(await bd.collection("movimientos").countDocuments({ loteId: l._id }), 1);
    });
    await t.test("reintentos concurrentes y líneas repetidas reservan una sola vez", async () => {
      const l = await nuevoLote(), d = plan(l, 60, { items: [{ loteId: String(l._id), cantidad: 60 }, { loteId: String(l._id), cantidad: 40 }] });
      const resultados = await Promise.all([servicio.programar(coord, d), servicio.programar(coord, d)]);
      assert.equal(new Set(resultados.map(r => r.id)).size, 1);
      assert.equal((await entrega(resultados[0].id))?.items.length, 1);
      assert.equal((await servicio.programar(coord, d)).repetida, true);
      await assert.rejects(servicio.programar(coord, { ...d, lugar: "Otro lugar" }), { status: 409 });
      await saldos(l, 200, 100);
    });
    await t.test("modificar es atómico, exige versión y cancelar libera sin descontar", async () => {
      const a = await nuevoLote(), b = await nuevoLote({ cantidad: 10 });
      const p = plan(a, 100), e = await servicio.programar(coord, p);
      const cambio = { ...p, claveOperacion: randomUUID(), versionDatos: 1, motivo: "Cambio de plan", items: [{ loteId: String(a._id), cantidad: 50 }, { loteId: String(b._id), cantidad: 20 }] };
      await assert.rejects(servicio.modificar(coord, e.id, cambio), { status: 409 });
      await saldos(a, 200, 100); await saldos(b, 10, 0);
      const valido = { ...cambio, items: [{ loteId: String(b._id), cantidad: 5 }] };
      await servicio.modificar(coord, e.id, valido); assert.equal((await servicio.modificar(coord, e.id, valido)).repetida, true);
      await assert.rejects(servicio.modificar(coord, e.id, { ...valido, claveOperacion: randomUUID() }), { status: 409 });
      await saldos(a, 200, 0); await saldos(b, 10, 5);
      const c = { claveOperacion: randomUUID(), versionDatos: 2, motivo: "Se canceló el compromiso" };
      await servicio.cancelar(admin, e.id, c); assert.equal((await servicio.cancelar(admin, e.id, c)).repetida, true);
      await saldos(b, 10, 0); assert.equal((await entrega(e.id))?.estado, "cancelada");
    });
    await t.test("el responsable asignado confirma 80 de 100 una vez y se libera el remanente", async () => {
      const l = await nuevoLote(), e = await servicio.programar(coord, plan(l, 100));
      const c = confirmacion(l, 80);
      await assert.rejects(servicio.confirmar(otro, e.id, c), { status: 404 });
      await assert.rejects(servicio.confirmar(voluntario, e.id, confirmacion(l, 120)), { status: 409 });
      const r = await Promise.all([servicio.confirmar(voluntario, e.id, c), servicio.confirmar(voluntario, e.id, c)]);
      assert.equal(r.filter(x => !x.repetida).length, 1); await saldos(l, 120, 0);
      const d = (await entrega(e.id))!;
      assert.equal(d.estado, "por_documentar"); assert.equal(String(d.registradaPor), coord.id); assert.equal(String(d.entregadaPor), voluntario.id);
      assert.equal(d.items[0].cantidadProgramada, 100); assert.equal(d.items[0].cantidadEntregada, 80);
      assert.equal("pesoTotalKg" in d, false); assert.deepEqual(d.revision, {});
      assert.equal(await bd.collection("movimientos").countDocuments({ entregaId: d._id, tipo: "entrega" }), 1);
      await assert.rejects(servicio.cancelar(admin, e.id, { claveOperacion: randomUUID(), versionDatos: d.versionDatos, motivo: "No debe volver atrás" }), { status: 409 });
    });
    await t.test("un fallo al crear la salida revierte stock, reserva y estado de entrega", async () => {
      const l = await nuevoLote(), e = await servicio.programar(coord, plan(l, 100));
      const entrada = (await bd.collection("movimientos").findOne({ loteId: l._id }))!;
      const conflictoId = new ObjectId();
      await bd.collection("movimientos").insertOne({ ...entrada, _id: conflictoId, claveOperacion: `entrega:${e.id}:${l._id}` });
      try { await assert.rejects(servicio.confirmar(voluntario, e.id, confirmacion(l, 80)), { status: 409 }); }
      finally { await bd.collection("movimientos").deleteOne({ _id: conflictoId }); }
      await saldos(l, 200, 100); assert.equal((await entrega(e.id))?.estado, "programada");
    });
    await t.test("vencimiento dinámico impide reservar o confirmar, pero permite liberar reservas", async () => {
      const l = await nuevoLote({ fechaVencimiento: "2026-11-27" });
      await assert.rejects(servicio.programar(coord, plan(l, 50, { fechaProgramada: "2026-11-28T10:00" })), { status: 409 });
      const e = await servicio.programar(coord, plan(l, 50));
      const anterior = ahora; ahora = new Date("2026-11-28T16:00:00Z");
      try {
        await assert.rejects(servicio.confirmar(voluntario, e.id, confirmacion(l, 50)), { status: 409 });
        assert.equal((await consultas.listar(new URLSearchParams(`q=${l.codigo}`), true)).total, 0);
        await servicio.cancelar(coord, e.id, { claveOperacion: randomUUID(), versionDatos: 1, motivo: "Lote vencido" });
        await saldos(l, 200, 0);
      } finally { ahora = anterior; }
    });
    await t.test("merma que afecta reservas exige selección y deja reasignación pendiente", async () => {
      const l = await nuevoLote(), a = await servicio.programar(coord, plan(l, 100)), b = await servicio.programar(admin, plan(l, 40));
      const m = movimiento(l, "merma", 100);
      await assert.rejects(servicio.registrarMovimiento(coord, m), { status: 409 }); await saldos(l, 200, 140);
      const conReduccion = { ...m, reducciones: [{ entregaId: a.id, versionDatos: 1, cantidad: 40 }] };
      await servicio.registrarMovimiento(coord, conReduccion); assert.equal((await servicio.registrarMovimiento(coord, conReduccion)).repetida, true);
      await saldos(l, 100, 100);
      const d = (await entrega(a.id))!; assert.equal(d.requiereReasignacion, true); assert.equal(d.items[0].cantidadProgramada, 100); assert.equal(d.items[0].cantidadReservada, 60);
      assert.equal((await entrega(b.id))?.versionDatos, 1);
      await assert.rejects(servicio.confirmar(voluntario, a.id, confirmacion(l, 60, { versionDatos: 2 })), { status: 409 });
      await servicio.modificar(coord, a.id, { ...plan(l, 60), versionDatos: 2, motivo: "Ajuste tras la merma" });
      await servicio.confirmar(voluntario, a.id, confirmacion(l, 50, { versionDatos: 3 }));
      await saldos(l, 50, 40);
    });
    await t.test("dos mermas concurrentes con la misma versión no liberan dos veces la reserva", async () => {
      const l = await nuevoLote(), e = await servicio.programar(coord, plan(l, 180));
      const m = movimiento(l, "merma", 50, { reducciones: [{ entregaId: e.id, versionDatos: 1, cantidad: 30 }] });
      const r = await Promise.allSettled([servicio.registrarMovimiento(coord, m), servicio.registrarMovimiento(admin, { ...m, claveOperacion: randomUUID() })]);
      assert.equal(r.filter(v => v.status === "fulfilled").length, 1); await saldos(l, 150, 150);
    });
    await t.test("las devoluciones acumuladas no superan la salida y no repiten el ingreso", async () => {
      const l = await nuevoLote(), { m } = await salida(l);
      const d = movimiento(l, "devolucionEntrada", 50, { origenId: String(m._id), reincorporar: true });
      const r = await Promise.allSettled([servicio.registrarMovimiento(coord, d), servicio.registrarMovimiento(admin, { ...d, claveOperacion: randomUUID() })]);
      assert.equal(r.filter(x => x.status === "fulfilled").length, 1); await saldos(l, 170, 0);
      const ganador = r[0].status === "fulfilled" ? coord : admin;
      const mGuardado = (await bd.collection("movimientos").findOne({ tipo: "devolucionEntrada", loteId: l._id }))!;
      const reintento = { ...d, claveOperacion: String(mGuardado.claveOperacion).split(":")[1] };
      assert.equal((await servicio.registrarMovimiento(ganador, reintento)).repetida, true);
      await assert.rejects(servicio.registrarMovimiento(coord, movimiento(l, "devolucionEntrada", 31, { origenId: String(m._id), reincorporar: true })), { status: 409 });
    });
    await t.test("retorno no apto registra devolución y merma juntas sin ofrecer esos productos", async () => {
      const l = await nuevoLote(), { m } = await salida(l);
      const d = movimiento(l, "devolucionEntrada", 10, { origenId: String(m._id), reincorporar: false });
      const r = await servicio.registrarMovimiento(coord, d);
      await saldos(l, 120, 0);
      const merma = await bd.collection("movimientos").findOne({ origenId: oid(r.id), tipo: "merma" });
      assert.equal(merma?.cantidad, 10); assert.equal((await servicio.registrarMovimiento(coord, d)).repetida, true);
      assert.equal(await bd.collection("movimientos").countDocuments({ origenId: oid(r.id), tipo: "merma" }), 1);
    });
    await t.test("devolver a donante conserva origen y no acepta movimientos de otro lote", async () => {
      const l = await nuevoLote({ cantidad: 50 }), otroLote = await nuevoLote();
      const m = (await bd.collection("movimientos").findOne({ loteId: l._id, tipo: "recepcion" }))!;
      await assert.rejects(servicio.registrarMovimiento(coord, movimiento(otroLote, "devolucionSalida", 10, { origenId: String(m._id) })), { status: 400 });
      await servicio.registrarMovimiento(coord, movimiento(l, "devolucionSalida", 10, { origenId: String(m._id) }));
      await saldos(l, 40, 0);
      await assert.rejects(servicio.registrarMovimiento(coord, movimiento(l, "devolucionSalida", 41, { origenId: String(m._id) })), { status: 409 });
    });
    await t.test("corregir conserva el original, invalida revisión pendiente y respeta devoluciones previas", async () => {
      const l = await nuevoLote(), { e, m } = await salida(l);
      await bd.collection("entregas").updateOne({ _id: oid(e.id) }, { $set: { estado: "entregada", archivos: [new ObjectId()] } });
      await assert.rejects(servicio.registrarMovimiento(coord, movimiento(l, "ajusteEntrada", 5, { origenId: String(m._id) })), { status: 403 });
      const d = movimiento(l, "ajusteEntrada", 5, { origenId: String(m._id) });
      await servicio.registrarMovimiento(admin, d); assert.equal((await servicio.registrarMovimiento(admin, d)).repetida, true);
      await saldos(l, 125, 0);
      assert.equal((await entrega(e.id))?.estado, "por_documentar"); assert.equal((await entrega(e.id))?.versionDatos, 3);
      assert.equal((await bd.collection("movimientos").findOne({ _id: m._id }))?.cantidad, 80);
      await servicio.registrarMovimiento(coord, movimiento(l, "devolucionEntrada", 70, { origenId: String(m._id), reincorporar: true }));
      await assert.rejects(servicio.registrarMovimiento(admin, movimiento(l, "ajusteEntrada", 6, { origenId: String(m._id) })), { status: 409 });
      const vista = (await consultas.detalle(admin, String(l._id)))!.movimientos.find(x => x.id === String(m._id))!;
      assert.equal(vista.cantidad, 80); assert.equal(vista.cantidadEfectiva, 75); assert.equal(vista.devuelto, 70); await saldos(l, 195, 0);
    });
    await t.test("un expediente completado exige reapertura y un ajuste de recepción no inventa aprobación", async () => {
      const l = await nuevoLote(), m = (await bd.collection("movimientos").findOne({ loteId: l._id, tipo: "recepcion" }))!;
      await bd.collection("donaciones").updateOne({ _id: l.donacionId }, { $set: { estado: "completada", archivos: [new ObjectId()],
        revision: { revisadaPor: oid(admin.id), revisadaEn: ahora, versionRevisada: 1, rolAlRevisar: "administrador" } } });
      await assert.rejects(servicio.registrarMovimiento(admin, movimiento(l, "ajusteSalida", 10, { origenId: String(m._id) })), { status: 409 });
      await saldos(l, 200, 0);
      const l2 = await nuevoLote(), m2 = (await bd.collection("movimientos").findOne({ loteId: l2._id, tipo: "recepcion" }))!;
      await servicio.registrarMovimiento(admin, movimiento(l2, "ajusteSalida", 10, { origenId: String(m2._id) })); await saldos(l2, 190, 0);
      assert.equal((await bd.collection("donaciones").findOne({ _id: l2.donacionId }))?.versionDatos, 2);
    });
    await t.test("FEFO excluye vencidos y agotados, ordena sin fecha al final y pagina la consulta", async () => {
      const marca = `FEFO-${randomUUID()}`;
      const ninguno = await nuevoLote({ marca }), tardio = await nuevoLote({ marca, fechaVencimiento: "2026-12-31" }), pronto = await nuevoLote({ marca, fechaVencimiento: "2026-11-30" });
      await nuevoLote({ marca, fechaVencimiento: "2026-11-25" });
      const todoReservado = await nuevoLote({ marca }); await servicio.programar(coord, plan(todoReservado, 200));
      const lista = await consultas.listar(new URLSearchParams({ q: marca }), true);
      assert.deepEqual(lista.registros.map(l => l.id), [String(pronto._id), String(tardio._id), String(ninguno._id)]);
      const futura = await consultas.listar(new URLSearchParams({ q: marca, fecha: "2026-12-10T12:00" }), true);
      assert.deepEqual(futura.registros.map(l => l.id), [String(tardio._id), String(ninguno._id)]);
      assert.equal((await consultas.listar(new URLSearchParams({ q: ".*" }), true)).total, 0);
      const p1 = await consultas.listar(new URLSearchParams()), p2 = await consultas.listar(new URLSearchParams("pagina=2"));
      assert.equal(p1.registros.length, 20); assert.ok(p2.registros.length > 0);
      assert.equal(p1.registros.some(l => p2.registros.some(r => l.id === r.id)), false);
    });
    await t.test("permisos por rol, asignación y búsqueda no revelan entregas ajenas", async () => {
      const l = await nuevoLote(), e = await servicio.programar(coord, plan(l, 100));
      await assert.rejects(servicio.programar(voluntario, plan(l, 10)), { status: 403 });
      await assert.rejects(servicio.registrarMovimiento(voluntario, movimiento(l, "merma", 1)), { status: 403 });
      await assert.rejects(servicio.programar({ ...voluntario, rol: "administrador" }, plan(l, 1)), { status: 403 });
      const filtros = leerFiltros(new URLSearchParams(`q=${(await entrega(e.id))?.codigo}`), "entregas");
      assert.equal(await bd.collection("entregas").countDocuments(filtroOperacion(otro, "entregas", filtros)), 0);
      assert.equal(await bd.collection("entregas").countDocuments(filtroOperacion(voluntario, "entregas", filtros)), 1);
      const detalle = (await consultas.detalle(otro, String(l._id)))!;
      assert.equal(detalle.reservas.length, 0); assert.equal(detalle.lote.reservada, 100); assert.equal(detalle.puedeVerDonacion, false);
      await assert.rejects(consultas.responsables(voluntario), { status: 403 });
      assert.deepEqual(Object.keys((await consultas.responsables(admin))[0]).sort(), ["id", "nombre", "rol"]);
      await bd.collection("voluntarios").updateOne({ _id: oid(otro.id) }, { $set: { activo: false } });
      await assert.rejects(servicio.programar(coord, plan(l, 10, { responsablePrevistoId: otro.id })), { status: 400 });
    });
  } finally {
    try {
      if (creada) {
        assert.match(bd.databaseName, /^bab_test_[a-f0-9]{24}$/); assert.equal(bd.databaseName, nombreBase);
        for (const nombre of Object.keys(validadores)) if (await bd.listCollections({ name: nombre }, { nameOnly: true }).hasNext()) await bd.collection(nombre).drop();
        console.log("Base temporal de inventario retirada; bab_donaciones no recibió escrituras de prueba.");
      }
    } finally { await cliente.close(); }
  }
});
