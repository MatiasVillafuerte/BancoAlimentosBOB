import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { test } from "node:test";
import sharp from "sharp";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { validarContenido } from "../src/lib/documentos/validacion";
import { leerCarga } from "../src/lib/documentos/multipart";
import { cargaSchema, corregirEntregaSchema, revisionSchema, MAX_ARCHIVO } from "../src/lib/documentos/modelo";

test("valida fotografías por contenido y conserva el hash del original", async () => {
  for (const formato of ["jpeg", "png", "webp"] as const) {
    const bytes = await sharp({ create: { width: 20, height: 12, channels: 3, background: "red" } }).toFormat(formato).toBuffer();
    const r = await validarContenido(bytes, "C:\\fotos\\evidencia<script>.exe");
    assert.equal(r.mime, `image/${formato}`); assert.equal(r.tipo, "foto");
    assert.equal(r.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(r.ancho, 20); assert.equal(r.alto, 12); assert.match(r.nombre, /^evidenciascript\.(jpg|png|webp)$/);
  }
});
test("rechaza extensiones falsas, imágenes truncadas, vacías y demasiado grandes", async () => {
  await assert.rejects(validarContenido(Buffer.from("<svg><script>alert(1)</script></svg>"), "foto.png"), { status: 415 });
  const jpeg = await sharp({ create: { width: 20, height: 12, channels: 3, background: "red" } }).jpeg().toBuffer();
  await assert.rejects(validarContenido(jpeg.subarray(0, 80), "foto.jpg"), { status: 400 });
  await assert.rejects(validarContenido(Buffer.alloc(0), "vacio.png"), { status: 413 });
  await assert.rejects(validarContenido(Buffer.alloc(MAX_ARCHIVO + 1), "enorme.pdf"), { status: 413 });
});
test("rechaza fotos de más de 25 megapíxeles", async () => {
  const bytes = await sharp({ create: { width: 5100, height: 5000, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(validarContenido(bytes, "foto.png"), { status: 400 });
});
test("valida PDF estático completo y rechaza documentos dañados o sin páginas", async () => {
  const pdf = await PDFDocument.create(); pdf.addPage([100, 100]);
  const bytes = Buffer.from(await pdf.save());
  const r = await validarContenido(bytes, "comprobante.jpg");
  assert.equal(r.mime, "application/pdf"); assert.equal(r.nombre, "comprobante.pdf"); assert.equal(r.paginas, 1);
  await assert.rejects(validarContenido(bytes.subarray(0, -8), "roto.pdf"), { status: 400 });
  const vacio = await PDFDocument.create();
  await assert.rejects(validarContenido(Buffer.from(await vacio.save({ addDefaultPage: false })), "vacio.pdf"), { status: 400 });
});
test("rechaza PDF con acciones ejecutables incluso si el tipo es una referencia indirecta", async () => {
  const pdf = await PDFDocument.create(); pdf.addPage();
  const nombre = pdf.context.register(PDFName.of("Launch"));
  pdf.catalog.set(PDFName.of("AccionPrueba"), pdf.context.obj({ S: nombre, F: PDFString.of("programa.exe") }));
  await assert.rejects(validarContenido(Buffer.from(await pdf.save()), "peligroso.pdf"), { status: 400 });
  pdf.catalog.delete(PDFName.of("AccionPrueba"));
  pdf.catalog.set(PDFName.of("OpenAction"), pdf.context.obj({ S: PDFName.of("JavaScript"), JS: PDFString.of("void(0)") }));
  await assert.rejects(validarContenido(Buffer.from(await pdf.save()), "activo.pdf"), { status: 400 });
});
test("recibe un multipart acotado y no confía en el tipo MIME que declara el cliente", async () => {
  const f = new FormData(); f.set("archivo", new File(["contenido"], "ejemplo.png", { type: "image/png" }));
  f.set("datos", JSON.stringify({ descripcion: "Foto" }));
  const r = await leerCarga(new Request("http://localhost/api/archivos", { method: "POST", body: f }));
  assert.equal(r.nombre, "ejemplo.png"); assert.equal(r.bytes.toString(), "contenido");
  await assert.rejects(validarContenido(r.bytes, r.nombre), { status: 415 });
  f.append("archivo", new File(["otro"], "otro.png"));
  await assert.rejects(leerCarga(new Request("http://localhost/api/archivos", { method: "POST", body: f })), { status: 400 });
});
test("limita el cuerpo real sin Content-Length y rechaza campos adicionales", async () => {
  const f = new FormData(); f.set("archivo", new File([new Uint8Array(MAX_ARCHIVO + 65537)], "grande.png")); f.set("datos", "{}");
  await assert.rejects(leerCarga(new Request("http://localhost/api/archivos", { method: "POST", body: f })), { status: 413 });
  f.set("archivo", new File(["foto"], "foto.png")); f.set("subidoPor", "otra-persona");
  await assert.rejects(leerCarga(new Request("http://localhost/api/archivos", { method: "POST", body: f })), { status: 400 });
});
test("los formularios no permiten falsificar autores, aprobar sin confirmar ni corregir cantidades", () => {
  const base = { versionDatos: 1, claveOperacion: randomUUID() };
  assert.equal(cargaSchema.safeParse({ ...base, entidad: "donaciones", entidadId: "1".repeat(24), subidoPor: "2".repeat(24) }).success, false);
  assert.equal(revisionSchema.safeParse({ ...base, decision: "aprobar", confirmacion: false }).success, false);
  assert.equal(revisionSchema.safeParse({ ...base, decision: "observar", confirmacion: true, observacion: "  " }).success, false);
  const correccion = { ...base, motivo: "Completar receptor", lugar: "Comedor", recibidoPor: "Ana", beneficiariosAtendidos: 12, observaciones: "" };
  assert.equal(corregirEntregaSchema.safeParse(correccion).success, true);
  assert.equal(corregirEntregaSchema.safeParse({ ...correccion, items: [] }).success, false);
});
