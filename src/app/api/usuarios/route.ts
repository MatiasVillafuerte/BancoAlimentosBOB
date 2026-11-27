import { consultarCatalogo, guardarRegistro } from "@/lib/registros/http";
export const runtime = "nodejs";
export function GET(request: Request) { return consultarCatalogo(request, "usuarios"); }
export function POST(request: Request) { return guardarRegistro(request, "usuarios"); }
