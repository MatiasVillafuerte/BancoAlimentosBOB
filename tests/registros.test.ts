import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { convenioAplicable, convenioSchema, donanteSchema, editarUsuarioSchema, ErrorRegistro, finDia, horaBolivia,
  inicioDia, loteSchema, organizacionSchema, recepcionSchema, usuarioSchema, validar } from "../src/lib/registros/modelo";

const donante = { claveOperacion: randomUUID(), nombre: "Persona ocasional", tipo: "persona", activo: true, contacto: {} };
const lote = { producto: "Arroz", categoria: "no perecedero", cantidad: 20, unidad: "bolsa", zona: "Z1", conservacion: "ambiente" };
const id = "000000000000000000000001";
const recepcion = { claveOperacion: randomUUID(), donanteId: id, fechaRecepcion: "2026-11-26T12:30", lotes: [lote] };

test("un donante ocasional no necesita NIT, contacto o convenio", () => {
  const d = validar(donanteSchema, donante);
  assert.equal(d.nit, undefined);
  assert.deepEqual(d.contacto, {});
  assert.equal(validar(recepcionSchema, recepcion).convenioId, undefined);
});
test("no se aceptan autores, saldos, aprobaciones ni campos desconocidos desde el formulario", () => {
  for (const extra of [{ registradaPor: id }, { estado: "completada" }, { archivos: [id] }, { revision: {} }, { pesoTotalKg: 20 }]) {
    assert.throws(() => validar(recepcionSchema, { ...recepcion, ...extra }), ErrorRegistro);
  }
  assert.throws(() => validar(loteSchema, { ...lote, cantidadEnBodega: 999 }), ErrorRegistro);
  assert.throws(() => validar(donanteSchema, { ...donante, passwordHash: "x" }), ErrorRegistro);
});
test("se rechazan cantidades imposibles y se conservan tres decimales", () => {
  for (const cantidad of [0, -1, NaN, Infinity, 0.0001, 1000001, "10"]) {
    assert.throws(() => validar(loteSchema, { ...lote, cantidad }), ErrorRegistro);
  }
  assert.equal(validar(loteSchema, { ...lote, cantidad: 12.345 }).cantidad, 12.345);
  assert.throws(() => validar(recepcionSchema, { ...recepcion, lotes: [] }), ErrorRegistro);
  assert.throws(() => validar(recepcionSchema, { ...recepcion, lotes: Array(31).fill(lote) }), ErrorRegistro);
});
test("la recepción valida fechas reales y conservación sin inventar el vencimiento", () => {
  assert.equal(validar(loteSchema, lote).fechaVencimiento, undefined);
  assert.throws(() => validar(loteSchema, { ...lote, fechaVencimiento: "2026-02-30" }), ErrorRegistro);
  assert.throws(() => validar(recepcionSchema, { ...recepcion, fechaRecepcion: "2026-11-26T24:30" }), ErrorRegistro);
  assert.throws(() => validar(loteSchema, { ...lote, conservacion: "refrigerado" }), ErrorRegistro);
  assert.throws(() => validar(loteSchema, { ...lote, categoria: "limpieza" }), ErrorRegistro);
  assert.throws(() => validar(loteSchema, { ...lote, zona: "Z4" }), ErrorRegistro);
  assert.equal(validar(loteSchema, { ...lote, categoria: "limpieza", zona: "Z4" }).zona, "Z4");
});
test("las fechas de negocio usan Bolivia y la vigencia incluye todo el último día", () => {
  assert.equal(horaBolivia("2026-11-26T12:30").toISOString(), "2026-11-26T16:30:00.000Z");
  const c = { donanteId: id, desde: inicioDia("2026-11-01"), hasta: finDia("2026-11-26") };
  assert.equal(convenioAplicable(c, id, horaBolivia("2026-11-26T23:59")), true);
  assert.equal(convenioAplicable(c, id, inicioDia("2026-11-27")), false);
  assert.equal(convenioAplicable(c, "otro", inicioDia("2026-11-26")), false);
  assert.throws(() => validar(convenioSchema, { claveOperacion: randomUUID(), donanteId: id, nombre: "Acuerdo", desde: "2026-12-01", hasta: "2026-11-30", condiciones: "Condiciones" }), ErrorRegistro);
});
test("la población de una organización no duplica niños y adultos mayores en el total", () => {
  const o = { claveOperacion: randomUUID(), nombre: "Comedor", tipo: "comedor", direccion: "Calle 1", zona: "Norte",
    responsable: { nombre: "Contacto", telefono: "1234" }, poblacion: { ninos: 10, adultosMayores: 20, total: 30 }, activa: true };
  assert.equal(validar(organizacionSchema, o).poblacion.total, 30);
  assert.throws(() => validar(organizacionSchema, { ...o, poblacion: { ...o.poblacion, total: 25 } }), ErrorRegistro);
});
test("las cuentas normalizan correo y requieren contraseña inicial robusta", () => {
  const u = { claveOperacion: randomUUID(), nombre: "Prueba", email: " PERSONA@EXAMPLE.COM ", telefono: "123456", rol: "voluntario", activo: true, passwordInicial: "Contraseña ficticia 2026" };
  assert.equal(validar(usuarioSchema, u).email, "persona@example.com");
  assert.throws(() => validar(usuarioSchema, { ...u, passwordInicial: "corta" }), ErrorRegistro);
  assert.throws(() => validar(editarUsuarioSchema, { nombre: "Prueba", email: "persona@example.com", telefono: "1234", rol: "root", activo: true, versionDatos: 0 }), ErrorRegistro);
});
