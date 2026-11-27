import { escribirInventario } from "@/lib/inventario/http";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { return escribirInventario(request, "confirmar", (await params).id); }
