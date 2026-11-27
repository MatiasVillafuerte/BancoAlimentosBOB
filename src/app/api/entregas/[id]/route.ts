import { responderFicha } from "@/lib/operaciones/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responderFicha("entregas", (await params).id);
}
