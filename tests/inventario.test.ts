import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { cancelarSchema, confirmarSchema, estadoLote, leerFiltrosInventario, modificarPlanSchema, movimientoSchema, programarSchema, redondear, unificarItems } from "../src/lib/inventario/modelo";
import { fichaPublica } from "../src/lib/operaciones/modelo";
const loteId = "000000000000000000000001";
const plan = () => ({ claveOperacion: randomUUID(), organizacionId: loteId, responsablePrevistoId: loteId, fechaProgramada: "2026-11-27T12:00",
  lugar: "Comedor de prueba", beneficiariosPrevistos: 10, items: [{ loteId, cantidad: 100 }] });

test("programar solo admite datos de planificación, cantidades positivas y fechas reales", () => {
  assert.equal(programarSchema.safeParse(plan()).success, true);
  for (const extra of [{ registradaPor: loteId }, { estado: "completada" }, { cantidadReservada: 100 }, { fechaProgramada: "2026-02-30T12:00" },
    { items: [] }, { items: [{ loteId, cantidad: 0 }] }, { items: [{ loteId, cantidad: 0.0001 }] }, { items: [{ loteId, cantidad: Infinity }] }]) {
    assert.equal(programarSchema.safeParse({ ...plan(), ...extra }).success, false);
  }
});
test("modificar y cancelar requieren versión y motivo, no autorizan cambiar el estado", () => {
  assert.equal(modificarPlanSchema.safeParse(plan()).success, false);
  assert.equal(modificarPlanSchema.safeParse({ ...plan(), versionDatos: 1, motivo: "Cambio de destino" }).success, true);
  assert.equal(cancelarSchema.safeParse({ claveOperacion: randomUUID(), versionDatos: 1, motivo: "   " }).success, false);
});
test("se unifican líneas del mismo lote y se conserva precisión de tres decimales", () => {
  assert.deepEqual(unificarItems([{ loteId, cantidad: 0.1 }, { loteId, cantidad: 0.2 }]), [{ loteId, cantidad: 0.3 }]);
  assert.equal(redondear(0.7 - 0.2), 0.5);
  assert.throws(() => unificarItems([{ loteId, cantidad: 999999 }, { loteId, cantidad: 2 }]));
});
test("una entrega parcial admite ceros por lote pero exige alguna salida real", () => {
  const base = { claveOperacion: randomUUID(), versionDatos: 1, fechaEntrega: "2026-11-27T12:00", recibidoPor: "Contacto", lugar: "Comedor", beneficiariosAtendidos: 2 };
  assert.equal(confirmarSchema.safeParse({ ...base, items: [{ loteId, cantidad: 0 }] }).success, false);
  assert.equal(confirmarSchema.safeParse({ ...base, items: [{ loteId, cantidad: 80 }, { loteId: "000000000000000000000002", cantidad: 0 }] }).success, true);
  assert.equal(confirmarSchema.safeParse({ ...base, items: [{ loteId, cantidad: -1 }] }).success, false);
});
test("devoluciones y correcciones exigen origen; el retorno recibido declara aptitud", () => {
  const m = { claveOperacion: randomUUID(), loteId, cantidad: 2, motivo: "Diferencia registrada" };
  assert.equal(movimientoSchema.safeParse({ ...m, tipo: "merma" }).success, true);
  for (const tipo of ["devolucionEntrada", "devolucionSalida", "ajusteEntrada", "ajusteSalida"]) assert.equal(movimientoSchema.safeParse({ ...m, tipo }).success, false);
  assert.equal(movimientoSchema.safeParse({ ...m, tipo: "devolucionEntrada", origenId: loteId }).success, false);
  assert.equal(movimientoSchema.safeParse({ ...m, tipo: "devolucionEntrada", origenId: loteId, reincorporar: false }).success, true);
  assert.equal(movimientoSchema.safeParse({ ...m, tipo: "merma", reincorporar: true }).success, false);
});
test("el vencimiento se evalúa en cada consulta y una devolución puede recuperar un lote agotado", () => {
  const ahora = new Date("2026-11-27T16:00:00Z"), base = { estado: "disponible", cantidadEnBodega: 10 };
  assert.equal(estadoLote({ ...base, fechaVencimiento: new Date("2026-11-26") }, ahora), "vencido");
  assert.equal(estadoLote({ ...base, cantidadEnBodega: 0 }, ahora), "agotado");
  assert.equal(estadoLote({ ...base, estado: "agotado" }, ahora), "disponible");
  assert.equal(estadoLote({ ...base, estado: "descartado" }, ahora), "descartado");
});
test("los filtros de inventario validan zona, fecha, estado, paginación y claves desconocidas", () => {
  assert.equal(leerFiltrosInventario(new URLSearchParams("zona=Z3&estado=proximo&pagina=2")).zona, "Z3");
  for (const q of ["zona=Z5", "estado[$ne]=vencido", "pagina=0", "pagina=1001", "pagina=1&pagina=2", "fecha=2026-02-30T12:00", "q=" + "a".repeat(81)]) {
    assert.throws(() => leerFiltrosInventario(new URLSearchParams(q)));
  }
  assert.throws(() => leerFiltrosInventario(new URLSearchParams("estado=vencido"), true));
});
test("la ficha conserva la salida original y calcula correcciones y retornos del mismo lote", () => {
  const entregaId = new ObjectId(), mid = new ObjectId(), lid = new ObjectId(loteId);
  const f = fichaPublica({ _id: entregaId, items: [] }, "entregas", { lotes: [], personas: new Map(), contraparte: null, convenio: null, archivos: [],
    salidas: [{ _id: mid, entregaId, loteId: lid, tipo: "entrega", cantidad: 80, unidad: "bolsa", relacionados: [
      { origenId: mid, loteId: lid, tipo: "ajusteEntrada", cantidad: 5 }, { origenId: mid, loteId: lid, tipo: "devolucionEntrada", cantidad: 10 },
      { origenId: mid, loteId: new ObjectId(), tipo: "devolucionEntrada", cantidad: 999 }
    ] }] });
  assert.deepEqual(f.salidas[0], { movimientoId: String(mid), loteId, unidad: "bolsa", original: 80, corregida: 75, devuelta: 10, neta: 65 });
});
