"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { COLECCIONES, construirPlan, id } = require("./modelo-v2.cjs");
const fecha = new Date("2026-11-24T20:00:00Z");
function datos() {
  return Object.fromEntries(COLECCIONES.map(c => [
    c, JSON.parse(fs.readFileSync(path.join(__dirname, "..", "datos", c + ".json"), "utf8"))
  ]));
}
function buscar(d, c, codigo) { return d[c].find(x => x.codigo === codigo); }

test("conserva documentos, saldos físicos y cantidades del historial", () => {
  const origen = datos(), original = JSON.stringify(origen);
  const p = construirPlan(origen, [], fecha);
  assert.deepEqual(p.errores, []);
  assert.equal(JSON.stringify(origen), original, "no debe modificar la entrada");
  for (const c of COLECCIONES) assert.deepEqual(p.datos[c].map(d => id(d._id)), origen[c].map(d => id(d._id)));
  for (const l of origen.lotes) {
    assert.equal(buscar(p.datos, "lotes", l.codigo).cantidadEnBodega, l.cantidadDisponible);
  }
  assert.deepEqual(p.datos.movimientos.map(m => [id(m._id), m.tipo, m.cantidad, m.unidad]),
    origen.movimientos.map(m => [id(m._id), m.tipo, m.cantidad, m.unidad]));
});
test("reserva solo las entregas pendientes y no duplica salidas realizadas", () => {
  const p = construirPlan(datos(), [], fecha);
  const yogur = buscar(p.datos, "lotes", "L-0015");
  const pan = buscar(p.datos, "lotes", "L-0018");
  assert.equal(yogur.cantidadEnBodega, 200);
  assert.equal(yogur.cantidadReservada, 60);
  assert.equal(pan.cantidadReservada, 80);
  assert.equal(buscar(p.datos, "entregas", "ENT-2026-0024").estado, "por_documentar");
  assert.equal(buscar(p.datos, "entregas", "ENT-2026-0025").estado, "programada");
  assert.equal(buscar(p.datos, "entregas", "ENT-2026-0024").items[1].cantidadEntregada, 100);
  assert.equal(buscar(p.datos, "entregas", "ENT-2026-0024").items[1].cantidadReservada, 0);
});
test("bloquea reservas superiores a existencias", () => {
  const d = datos();
  buscar(d, "entregas", "ENT-2026-0025").items[0].cantidad = 201;
  assert(construirPlan(d, [], fecha).errores.some(e => e.includes("reservas excesivas")));
});
test("detecta saldos alterados y no los corrige silenciosamente", () => {
  const d = datos();
  buscar(d, "lotes", "L-0009").cantidadDisponible = 999;
  assert(construirPlan(d, [], fecha).errores.some(e => e.includes("saldo no conciliado")));
});
test("repara los dos enlaces de muestra sin inventar autores ni aprobar expedientes", () => {
  const p = construirPlan(datos(), [], fecha);
  assert.equal(id(buscar(p.datos, "donaciones", "DON-2026-0015").convenioId), "6a1f0000000000000000000c");
  assert.equal(id(p.datos.movimientos.find(m => m.tipo === "devolucionEntrada").origenId), "6a1f0000000000000000002d");
  assert(p.datos.donaciones.every(d => d.estado === "por_documentar"));
  assert(p.datos.entregas.every(d => !d.registradaPor));
  assert(p.datos.voluntarios.every(d => !Object.hasOwn(d, "passwordHash")));
  assert([...p.datos.donaciones, ...p.datos.entregas].every(d => d.estado !== "completada"));
});
test("la migración es idempotente y conserva los campos originales", () => {
  const p1 = construirPlan(datos(), [], fecha);
  const p2 = construirPlan(p1.datos, [], new Date("2026-11-25T20:00:00Z"));
  assert.deepEqual(p2.errores, []);
  assert.deepEqual(p2.cambios, []);
  assert.deepEqual(p2.datos, p1.datos);
  assert.equal(buscar(p2.datos, "lotes", "L-0015").ubicacion, "Z3-E1");
  assert.equal(buscar(p2.datos, "lotes", "L-0015").cantidadDisponible, 200);
});
test("solo una foto de la propia entrega permite quedar lista para revisión", () => {
  const d = datos(), e = buscar(d, "entregas", "ENT-2026-0024");
  const archivoId = { $oid: "6a1f000000000000000000aa" };
  e.archivos = [archivoId];
  const foto = { _id: archivoId, metadata: { entidad: "entregas", entidadId: e._id, tipo: "foto" } };
  assert.equal(buscar(construirPlan(d, [foto], fecha).datos, "entregas", e.codigo).estado, "entregada");
  const acta = { ...foto, metadata: { ...foto.metadata, tipo: "acta" } };
  assert.equal(buscar(construirPlan(d, [acta], fecha).datos, "entregas", e.codigo).estado, "por_documentar");
  const ajena = { ...foto, metadata: { ...foto.metadata, entidad: "donaciones" } };
  assert(construirPlan(d, [ajena], fecha).errores.some(e => e.includes("otra operación")));
});
test("completada exige revisión identificada de la versión actual y conserva el rol histórico", () => {
  const d = construirPlan(datos(), [], fecha).datos;
  const e = buscar(d, "entregas", "ENT-2026-0024");
  const archivoId = { $oid: "6a1f000000000000000000aa" };
  const foto = { _id: archivoId, metadata: { entidad: "entregas", entidadId: e._id, tipo: "foto" } };
  e.archivos = [archivoId];
  e.estado = "completada";
  e.revision = { revisadaPor: d.voluntarios.find(u => u.rol === "administrador")._id, revisadaEn: fecha, versionRevisada: 1 };
  assert(construirPlan(d, [foto], fecha).errores.some(e => e.includes("aprobación administrativa")));
  e.revision.rolAlRevisar = "administrador";
  assert.deepEqual(construirPlan(d, [foto], fecha).errores, []);
  d.voluntarios.find(u => id(u._id) === id(e.revision.revisadaPor)).rol = "voluntario";
  assert.deepEqual(construirPlan(d, [foto], fecha).errores, [], "un cambio de rol posterior no invalida el historial");
  e.versionDatos = 2;
  assert(construirPlan(d, [foto], fecha).errores.some(e => e.includes("aprobación administrativa")));
});
test("bloquea unidades incompatibles, vencimiento anterior al plan y códigos duplicados", () => {
  const d = datos();
  buscar(d, "entregas", "ENT-2026-0025").items[0].unidad = "kg";
  buscar(d, "entregas", "ENT-2026-0025").fecha = { $date: "2027-01-01T12:00:00Z" };
  d.lotes[1].codigo = d.lotes[0].codigo;
  const p = construirPlan(d, [], fecha);
  assert(p.errores.some(e => e.includes("unidad distinta")));
  assert(p.errores.some(e => e.includes("vence antes")));
  assert(p.errores.some(e => e.includes("duplicada")));
});
