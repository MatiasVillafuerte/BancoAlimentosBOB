import { consultarCatalogo } from "@/lib/registros/http";
export const runtime = "nodejs";
type Contexto = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Contexto) { return consultarCatalogo(request, "convenios", (await params).id); }
