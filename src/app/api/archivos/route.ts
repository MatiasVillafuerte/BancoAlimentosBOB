import { consultarDocumentos, subirArchivo } from "@/lib/documentos/http";
export const runtime = "nodejs";
export const GET = consultarDocumentos;
export const POST = subirArchivo;
