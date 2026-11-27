import { responderListado } from "@/lib/operaciones/http";
import { guardarRegistro } from "@/lib/registros/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return responderListado(request, "donaciones"); }
export function POST(request: Request) { return guardarRegistro(request, "donaciones"); }
