import { consultarInventario } from "@/lib/inventario/http";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { return consultarInventario(request, "lotes", (await params).id); }
