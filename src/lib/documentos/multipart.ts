import { ErrorRegistro } from "../registros/modelo";
import { MAX_ARCHIVO } from "./modelo";

export async function leerCarga(request: Request) {
  const tipo = request.headers.get("content-type") || "";
  if (!/^multipart\/form-data\s*;/i.test(tipo)) throw new ErrorRegistro("Selecciona un archivo para subir.", 415);
  const limite = MAX_ARCHIVO + 65536;
  if (Number(request.headers.get("content-length")) > limite) throw new ErrorRegistro("El archivo supera los 10 MB admitidos.", 413);
  const lector = request.body?.getReader();
  if (!lector) throw new ErrorRegistro("No se recibió el archivo.");
  const trozos: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > limite) { await lector.cancel(); throw new ErrorRegistro("El archivo supera los 10 MB admitidos.", 413); }
      trozos.push(value);
    }
  } finally { lector.releaseLock(); }
  let formulario: FormData;
  try { formulario = await new Response(Buffer.concat(trozos), { headers: { "Content-Type": tipo } }).formData(); }
  catch { throw new ErrorRegistro("No se pudo leer el archivo. Selecciónalo nuevamente."); }
  if ([...formulario.keys()].some(k => !["archivo", "datos"].includes(k)) || formulario.getAll("archivo").length !== 1 || formulario.getAll("datos").length !== 1) {
    throw new ErrorRegistro("Envía un archivo y sus datos por solicitud.");
  }
  const archivo = formulario.get("archivo"), datos = formulario.get("datos");
  if (!(archivo instanceof File) || typeof datos !== "string" || datos.length > 4096) throw new ErrorRegistro("Revisa el archivo y su descripción.");
  if (archivo.size > MAX_ARCHIVO) throw new ErrorRegistro("El archivo supera los 10 MB admitidos.", 413);
  let entrada: unknown;
  try { entrada = JSON.parse(datos); } catch { throw new ErrorRegistro("Los datos del archivo no son válidos."); }
  return { entrada, bytes: Buffer.from(await archivo.arrayBuffer()), nombre: archivo.name };
}
