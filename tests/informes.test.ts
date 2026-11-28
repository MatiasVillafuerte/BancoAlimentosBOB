import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { agruparCantidades, cantidadesMovimiento, periodoInforme, resumenOperaciones } from "../src/lib/informes/modelo";

test("período incluye todo el último día de Bolivia y rechaza fechas normalizadas y filtros ambiguos", () => {
  const f = periodoInforme(new URLSearchParams("desde=2026-11-01&hasta=2026-11-27"));
  assert.equal(f.inicio.toISOString(), "2026-11-01T04:00:00.000Z");
  assert.equal(f.fin.toISOString(), "2026-11-28T04:00:00.000Z");
  for (const q of ["desde=2026-02-30", "desde=2027-01-01&hasta=2026-01-01", "desde=2024-01-01&hasta=2026-01-01", "hasta=", "hasta=2026-01-01&hasta=2026-01-02", "rol=administrador"]) assert.throws(() => periodoInforme(new URLSearchParams(q)));
  assert.equal(periodoInforme(new URLSearchParams(), new Date("2026-12-01T02:00:00Z")).hasta, "2026-11-30");
});
test("correcciones de salida y devoluciones conservan la cantidad original", () => {
  const o = { _id: "salida", loteId: "lote", tipo: "entrega", cantidad: 80, unidad: "bolsa" };
  const rel = [{ origenId: "salida", loteId: "lote", tipo: "ajusteEntrada", cantidad: 5, unidad: "bolsa" },
    { origenId: "salida", loteId: "lote", tipo: "devolucionEntrada", cantidad: 10, unidad: "bolsa" },
    { origenId: "ajeno", loteId: "lote", tipo: "ajusteEntrada", cantidad: 30, unidad: "bolsa" }];
  assert.deepEqual(cantidadesMovimiento(o, rel), { original: 80, corregida: 75, devuelta: 10, neta: 65 });
});
test("productos con unidades distintas no se suman y las fracciones no acumulan error", () => {
  const m = (id: string, cantidad: number, unidad: string) => ({ _id: id, loteId: "l", tipo: "recepcion", cantidad, unidad });
  const g = agruparCantidades([m("a", .1, "bolsa"), m("b", .2, "bolsa"), m("c", 2, "kg")], [], [{ _id: "l", producto: "Arroz" }]);
  assert.deepEqual(g.map(g => [g.unidad, g.neta]), [["bolsa", .3], ["kg", 2]]);
});
test("informes diferencian datos ausentes, cero y aprobación vigente", () => {
  const revisadaPor = new ObjectId(), revision = { revisadaPor, revisadaEn: new Date(), rolAlRevisar: "administrador", versionRevisada: 3 };
  const r = resumenOperaciones([{ estado: "por_documentar" }, { estado: "completada", versionDatos: 3, revision, pesoTotalKg: 0, beneficiariosAtendidos: 0 },
    { estado: "completada", versionDatos: 4, revision, beneficiariosAtendidos: 4 }], true);
  assert.equal(r.operaciones, 3); assert.equal(r.aprobadas, 1); assert.equal(r.pendientes, 2);
  assert.equal(r.pesoKgRegistrado, 0); assert.equal(r.operacionesConPeso, 1); assert.equal(r.atenciones, 4);
  assert.equal(resumenOperaciones([{}], true).pesoKgRegistrado, null);
});
