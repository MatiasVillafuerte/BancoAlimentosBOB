import { createHash } from "node:crypto";
import sharp from "sharp";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFStream, type PDFObject } from "pdf-lib";
import { ErrorRegistro } from "../registros/modelo";
import { MAX_ARCHIVO } from "./modelo";

export interface ContenidoValidado { nombre: string; tipo: "foto" | "pdf"; mime: string; sha256: string; ancho?: number; alto?: number; paginas?: number }
function nombreSeguro(nombre: string, extension: string) {
  const base = nombre.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "").replace(/\.[^.]*$/, "").trim().slice(0, 140);
  return `${base || "archivo"}.${extension}`;
}
function revisarObjetosPdf(documento: PDFDocument) {
  const pendientes: PDFObject[] = documento.context.enumerateIndirectObjects().map(([, v]) => v), vistos = new Set<PDFObject>();
  const prohibidos = new Set(["JS", "JavaScript", "AA", "OpenAction", "Launch", "RichMedia", "EmbeddedFiles", "EF", "XFA"]);
  const acciones = new Set(["JavaScript", "Launch", "SubmitForm", "ImportData", "GoToR", "GoToE", "RichMediaExecute"]);
  while (pendientes.length) {
    const objeto = pendientes.pop()!;
    if (vistos.has(objeto)) continue;
    vistos.add(objeto);
    if (vistos.size > 100000) throw new ErrorRegistro("El PDF es demasiado complejo para este prototipo.");
    if (objeto instanceof PDFStream) pendientes.push(objeto.dict);
    else if (objeto instanceof PDFDict) for (const [clave, valor] of objeto.entries()) {
      const k = clave.decodeText();
      const resuelto = documento.context.lookup(valor);
      if (prohibidos.has(k) || (k === "S" && resuelto instanceof PDFName && acciones.has(resuelto.decodeText())) ||
        (["Type", "Subtype"].includes(k) && resuelto instanceof PDFName && ["EmbeddedFile", "FileAttachment", "RichMedia"].includes(resuelto.decodeText()))) {
        throw new ErrorRegistro("El PDF contiene acciones, formularios activos o archivos adjuntos. Exporta una copia estática.");
      }
      pendientes.push(valor);
    }
    else if (objeto instanceof PDFArray) pendientes.push(...objeto.asArray());
  }
}
export async function validarContenido(bytes: Buffer, nombre: string): Promise<ContenidoValidado> {
  if (!bytes.length || bytes.length > MAX_ARCHIVO) throw new ErrorRegistro("El archivo debe tener contenido y ocupar como máximo 10 MB.", 413);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") {
    try {
      if (!/%%EOF\s*$/.test(bytes.subarray(-2048).toString("latin1"))) throw new Error("PDF incompleto");
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false });
      const paginas = pdf.getPageCount();
      if (paginas < 1 || paginas > 200) throw new ErrorRegistro("El PDF debe contener entre 1 y 200 páginas.");
      revisarObjetosPdf(pdf);
      return { nombre: nombreSeguro(nombre, "pdf"), tipo: "pdf", mime: "application/pdf", sha256, paginas };
    } catch (e) {
      if (e instanceof ErrorRegistro) throw e;
      throw new ErrorRegistro("No pudimos validar el PDF. Comprueba que esté completo y sin contraseña.");
    }
  }
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!jpeg && !png && !webp) throw new ErrorRegistro("Admitimos fotografías JPEG, PNG o WebP y documentos PDF. Cambiar la extensión no cambia el formato.", 415);
  try {
    const foto = sharp(bytes, { failOn: "warning", limitInputPixels: 25000000, animated: true });
    const m = await foto.metadata();
    if (!m.width || !m.height || m.width > 10000 || m.height > 10000 || (m.pages || 1) > 1) throw new Error("Dimensiones o animación no admitidas");
    await foto.raw().toBuffer(); // Decodifica el contenido, no solo la cabecera.
    const extension = jpeg ? "jpg" : png ? "png" : "webp";
    return { nombre: nombreSeguro(nombre, extension), tipo: "foto", mime: `image/${jpeg ? "jpeg" : extension}`, sha256, ancho: m.width, alto: m.height };
  } catch { throw new ErrorRegistro("La fotografía está dañada, animada o supera el límite de 25 megapíxeles y 10000 píxeles por lado."); }
}
