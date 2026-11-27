import { consultarCatalogo, guardarRegistro } from "@/lib/registros/http";
export const runtime = "nodejs";
type Contexto = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Contexto) { return consultarCatalogo(request, "usuarios", (await params).id); }
export async function PATCH(request: Request, { params }: Contexto) { return guardarRegistro(request, "usuarios", (await params).id); }
