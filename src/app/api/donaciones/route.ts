import { responderListado } from "@/lib/operaciones/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return responderListado(request, "donaciones"); }
