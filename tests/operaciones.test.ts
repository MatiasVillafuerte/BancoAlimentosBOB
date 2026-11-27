import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId, type Document } from "mongodb";
import { alcanceOperaciones, ErrorConsulta, fichaPublica, filaPublica, filtroOperacion, leerFiltros,
  personaPublica, pipelineListado, type ReferenciasFicha } from "../src/lib/operaciones/modelo";
import type { UsuarioPublico } from "../src/lib/auth/types";

const oid = (n: number) => new ObjectId(n.toString(16).padStart(24, "0"));
const usuario: UsuarioPublico = { id: oid(1).toHexString(), nombre: "Prueba", email: "prueba@example.com", telefono: "", rol: "voluntario" };
const filtros = leerFiltros(new URLSearchParams(), "donaciones");
const vacias = (): ReferenciasFicha => ({ personas: new Map(), lotes: [], contraparte: null, convenio: null, archivos: [] });

test("la consulta valida estados, paginación y parámetros antes de llegar a MongoDB", () => {
  assert.deepEqual(leerFiltros(new URLSearchParams("q=%20DON-2026%20&estado=por_documentar&pagina=2"), "donaciones"),
    { q: "DON-2026", estado: "por_documentar", grupo: "", pagina: 2 });
  for (const entrada of ["estado=programada", "pagina=0", "pagina=-1", "pagina=1.5", "pagina=1001", "pagina=1&pagina=2",
    "registradaPor=otra", "estado[$ne]=completada", "grupo=por_documentar", "q=" + "a".repeat(81)]) {
    assert.throws(() => leerFiltros(new URLSearchParams(entrada), "donaciones"), ErrorConsulta, entrada);
  }
  assert.throws(() => leerFiltros(new URLSearchParams("grupo=completada"), "alertas"), ErrorConsulta);
});

test("la búsqueda interpreta los caracteres especiales como texto y no como una expresión", () => {
  const q = "Empresa (A).* [1] + $";
  const f = filtroOperacion(usuario, "donaciones", { ...filtros, q });
  const regex = new RegExp(f.$or[0].codigo.$regex, "i");
  assert.equal(regex.test(q), true);
  assert.equal(regex.test("Empresa A cualquiera 1"), false);
  assert.equal(regex.test("cualquier donación"), false);
  assert.equal(f.registradaPor.toHexString(), usuario.id);
});

test("las recepciones conservan autoría; las entregas admiten gestión de equipo y asignación", () => {
  assert.deepEqual(alcanceOperaciones({ ...usuario, rol: "administrador" }), {});
  for (const rol of ["voluntario", "coordinador"] as const) {
    assert.equal(alcanceOperaciones({ ...usuario, rol }).registradaPor.toHexString(), usuario.id);
  }
  const entrega = filtroOperacion(usuario, "entregas", filtros);
  assert.equal(entrega.$or[0].registradaPor.toHexString(), usuario.id);
  assert.equal(entrega.$or[1].responsablePrevistoId.toHexString(), usuario.id);
  assert.equal(entrega.$or[2].entregadaPor.toHexString(), usuario.id);
  assert.deepEqual(entrega.$or[2].fechaEntrega, { $type: "date" });
  assert.deepEqual(alcanceOperaciones({ ...usuario, rol: "coordinador" }, "entregas"), {});
  const buscada = filtroOperacion(usuario, "entregas", { ...filtros, q: "Comedor" });
  assert.deepEqual(buscada.$or, entrega.$or);
  assert.equal(buscada.$and[0].$or[1]["organizacion.nombre"].$regex, "Comedor");
});

test("cada mitad de las alertas conserva permisos y distingue recibida de entregada", () => {
  const f = { ...filtros, grupo: "por_revisar" };
  const pipeline = pipelineListado(usuario, "alertas", f);
  const donaciones = pipeline[0].$match;
  const entregas = pipeline.find(p => p.$unionWith)?.$unionWith.pipeline[0].$match;
  assert.equal(donaciones.registradaPor.toHexString(), usuario.id);
  assert.equal(entregas.$or[0].registradaPor.toHexString(), usuario.id);
  assert.equal(donaciones.estado, "recibida");
  assert.equal(entregas.estado, "entregada");
  for (const tipo of ["donaciones", "entregas"] as const) {
    const pendientes = filtroOperacion(usuario, tipo, filtros, true).estado.$in;
    assert.equal(pendientes.includes("completada"), false);
    assert.equal(pendientes.includes("programada"), false);
  }
});

test("los perfiles y las filas publican solo datos permitidos", () => {
  const p = { _id: oid(1), nombre: "Cuenta", email: "cuenta@example.com", telefono: "123", rol: "voluntario", activo: true,
    passwordHash: "CANARIO_PRIVADO", sesiones: [{ tokenHash: "CANARIO_PRIVADO" }], acceso: { intentos: 5 }, secreto: "CANARIO_PRIVADO" };
  assert.deepEqual(Object.keys(personaPublica(p)!).sort(), ["activo", "email", "id", "nombre", "rol", "telefono"]);
  const fila = filaPublica({ _id: oid(2), codigo: "DON-1", tipo: "donaciones", fecha: new Date("2026-11-20T12:00:00Z"),
    contraparte: "Donante", registradaPor: oid(1), estado: "por_documentar", passwordHash: "CANARIO_PRIVADO" }, new Map([[usuario.id, p]]));
  assert.equal(JSON.stringify([personaPublica(p), fila]).includes("CANARIO_PRIVADO"), false);
  assert.equal("email" in fila.autor!, false);
});

test("una entrega histórica no inventa autor, fecha de creación ni cantidades programadas", () => {
  const refs = vacias();
  refs.personas.set(usuario.id, { _id: oid(1), nombre: "Responsable conocido", activo: true });
  const ficha = fichaPublica({ _id: oid(2), codigo: "ENT-1", estado: "por_documentar", entregadaPor: oid(1),
    fechaEntrega: new Date("2026-11-20T12:00:00Z"), migracionV2: { fecha: new Date("2026-11-25T12:00:00Z") },
    items: [{ loteId: oid(3), cantidad: 20, cantidadReservada: 0, cantidadEntregada: 20, unidad: "bolsas" }] }, "entregas", refs);
  assert.equal(ficha.autor, null);
  assert.equal(ficha.autorReferenciado, false);
  assert.equal(ficha.registradaEn, null);
  assert.equal(ficha.responsableEntrega?.nombre, "Responsable conocido");
  assert.equal(ficha.lineasEntrega[0].programada, null);
  assert.equal(ficha.lineasEntrega[0].reservada, 0);
  assert.equal(ficha.lineasEntrega[0].entregada, 20);
  assert.equal(ficha.pesoTotalKg, null);
});

test("la ficha distingue recepción inicial, stock físico, reserva y libre sin mezclar unidades", () => {
  const refs = vacias();
  refs.lotes = [
    { _id: oid(3), cantidad: 240, cantidadEnBodega: 200, cantidadReservada: 100, unidad: "bolsas", estado: "disponible" },
    { _id: oid(4), cantidad: 10, cantidadEnBodega: 0, cantidadReservada: 0, unidad: "cajas", estado: "agotado" }
  ];
  const f = fichaPublica({ _id: oid(2) }, "donaciones", refs);
  assert.deepEqual(f.lotes.map(l => [l.cantidadRecibida, l.enBodega, l.reservada, l.libre, l.unidad]),
    [[240, 200, 100, 100, "bolsas"], [10, 0, 0, 0, "cajas"]]);
  assert.equal(f.pesoTotalKg, null);
});

test("una programación no presenta cifras legadas como atenciones o peso ya entregados", () => {
  const r = { _id: oid(2), estado: "programada", fechaProgramada: new Date("2026-11-23T12:00:00Z"),
    beneficiariosPrevistos: 32, beneficiariosAtendidos: 32, pesoTotalKg: 50 };
  const programada = fichaPublica(r, "entregas", vacias());
  assert.equal(programada.beneficiariosPrevistos, 32);
  assert.equal(programada.beneficiariosAtendidos, null);
  assert.equal(programada.pesoTotalKg, null);
  const realizada = fichaPublica({ ...r, estado: "por_documentar", fechaEntrega: new Date("2026-11-24T12:00:00Z") }, "entregas", vacias());
  assert.equal(realizada.beneficiariosAtendidos, 32);
  assert.equal(realizada.pesoTotalKg, 50);
});

test("una referencia de archivo ajena no expone sus metadatos", () => {
  const refs = vacias();
  refs.archivos = [
    { _id: oid(5), filename: "foto-propia.jpg", metadata: { entidad: "donaciones", entidadId: oid(2), tipo: "foto", mimeType: "image/jpeg", secreto: "CANARIO_PRIVADO" } },
    { _id: oid(6), filename: "CANARIO_PRIVADO", metadata: { entidad: "entregas", entidadId: oid(2) } },
    { _id: oid(7), filename: "CANARIO_PRIVADO", metadata: { entidad: "donaciones", entidadId: oid(99) } },
    { _id: oid(8), filename: "CANARIO_PRIVADO", metadata: { entidad: "donaciones", entidadId: oid(2) } }
  ];
  const f = fichaPublica({ _id: oid(2), archivos: [oid(5), oid(6), oid(7)] }, "donaciones", refs);
  assert.equal(f.archivos.length, 1);
  assert.equal(f.archivos[0].nombre, "foto-propia.jpg");
  assert.equal(f.archivosNoDisponibles, 2);
  assert.equal(JSON.stringify(f).includes("CANARIO_PRIVADO"), false);
});

test("revisión e historial conservan personas, fechas y versión sin arrastrar campos privados", () => {
  const refs = vacias();
  const persona: Document = { _id: oid(1), nombre: "Administradora", activo: true, passwordHash: "CANARIO_PRIVADO", sesiones: ["CANARIO_PRIVADO"] };
  refs.personas.set(usuario.id, persona);
  const f = fichaPublica({ _id: oid(2), registradaPor: oid(1), versionDatos: 3, passwordHash: "CANARIO_PRIVADO",
    revision: { revisadaPor: oid(1), versionRevisada: 2, rolAlRevisar: "administrador", observacion: "Falta etiqueta", secreto: "CANARIO_PRIVADO" },
    historial: [{ accion: "observada", usuarioId: oid(1), detalle: "Falta etiqueta", versionDatos: 2, secreto: "CANARIO_PRIVADO" }] }, "donaciones", refs);
  assert.equal(f.versionDatos, 3);
  assert.equal(f.revision.version, 2);
  assert.equal(f.revision.observacion, "Falta etiqueta");
  assert.equal(f.historial[0].persona?.nombre, "Administradora");
  assert.equal(JSON.stringify(f).includes("CANARIO_PRIVADO"), false);
});
