import { responderFicha } from "@/lib/operaciones/http";
import { escribirInventario } from "@/lib/inventario/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responderFicha("entregas", (await params).id);
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return escribirInventario(request, "modificar", (await params).id);
}
