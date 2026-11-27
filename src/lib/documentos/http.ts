import "server-only";
import { Readable } from "node:stream";
import { z } from "zod";
import { ErrorAcceso } from "../auth/core";
import { comprobarOrigen, leerJson, respuesta, respuestaError, usuarioActual } from "../auth/http";
import { ErrorRegistro, idSchema, validar } from "../registros/modelo";
import type { TipoOperacion } from "../operaciones/modelo";
import { ENTIDADES_DOCUMENTALES } from "./modelo";
import { servicioDocumentos } from "./consultas";
import { leerCarga } from "./multipart";

function errorDocumento(e: unknown) {
  if (e instanceof ErrorRegistro) return respuesta({ error: e.message }, e.status);
  if (e instanceof ErrorAcceso && e.codigo === "datos") return respuesta({ error: "Revisa los datos enviados y el tamaño de la solicitud." }, 400);
  return respuestaError(e);
}
async function autenticar(request: Request, escritura = false) {
  if (escritura && !comprobarOrigen(request)) throw new ErrorRegistro("Origen de solicitud no permitido.", 403);
  const u = await usuarioActual();
  if (!u) throw new ErrorAcceso("sesion");
  return u;
}
export async function consultarDocumentos(request: Request) {
  try {
    const u = await autenticar(request);
    const p = new URL(request.url).searchParams;
    if ([...p.keys()].some(k => !["entidad", "entidadId"].includes(k) || p.getAll(k).length !== 1)) throw new ErrorRegistro("Filtros no válidos.");
    const entidad = validar(z.enum(ENTIDADES_DOCUMENTALES), p.get("entidad"));
    const id = validar(idSchema, p.get("entidadId"));
    return respuesta(await (await servicioDocumentos()).detalle(u, entidad, id));
  } catch (e) { return errorDocumento(e); }
}
export async function subirArchivo(request: Request) {
  try {
    const u = await autenticar(request, true);
    const { entrada, bytes, nombre } = await leerCarga(request);
    const r = await (await servicioDocumentos()).subir(u, entrada, bytes, nombre);
    return respuesta(r, r.repetida ? 200 : 201);
  } catch (e) { return errorDocumento(e); }
}
export async function servirArchivo(request: Request, id: string) {
  try {
    const u = await autenticar(request), servicio = await servicioDocumentos();
    const f = await servicio.obtenerArchivo(u, id);
    const p = new URL(request.url).searchParams;
    if ([...p.keys()].some(k => k !== "descargar" || p.getAll(k).length !== 1) || (p.has("descargar") && p.get("descargar") !== "1")) throw new ErrorRegistro("Opción de descarga no válida.");
    const nombre = encodeURIComponent(f.filename).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    const flujo = servicio.almacen.bucket.openDownloadStream(f._id, { timeoutMS: 60000 });
    flujo.on("error", () => console.error("[BAB] No se pudo completar la lectura de un archivo."));
    return new Response(Readable.toWeb(flujo) as ReadableStream<Uint8Array>, { headers: {
      "Content-Type": f.metadata.mimeType, "Content-Length": String(f.length), "Cache-Control": "private, no-store",
      "Content-Disposition": `${p.has("descargar") ? "attachment" : "inline"}; filename="archivo.${f.metadata.tipo === "pdf" ? "pdf" : f.metadata.mimeType.split("/")[1]}"; filename*=UTF-8''${nombre}`,
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'self'",
      "Cross-Origin-Resource-Policy": "same-origin", "Referrer-Policy": "no-referrer"
    } });
  } catch (e) { return errorDocumento(e); }
}
export async function retirarArchivo(request: Request, id: string) {
  try {
    const u = await autenticar(request, true), datos = await leerJson(request);
    return respuesta(await (await servicioDocumentos()).retirar(u, id, datos));
  } catch (e) { return errorDocumento(e); }
}
export async function actuarDocumentacion(request: Request, tipo: TipoOperacion, id: string, accion: "enviar" | "revisar" | "reabrir" | "corregir") {
  try {
    const u = await autenticar(request, true), datos = await leerJson(request, 16384);
    return respuesta(await (await servicioDocumentos())[accion](u, tipo, id, datos));
  } catch (e) { return errorDocumento(e); }
}
