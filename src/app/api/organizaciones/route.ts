import { consultarCatalogo, guardarRegistro } from "@/lib/registros/http";
export const runtime = "nodejs";
export function GET(request: Request) { return consultarCatalogo(request, "organizaciones"); }
export function POST(request: Request) { return guardarRegistro(request, "organizaciones"); }
