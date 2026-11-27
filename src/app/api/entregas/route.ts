import { responderListado } from "@/lib/operaciones/http";
import { escribirInventario } from "@/lib/inventario/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return responderListado(request, "entregas"); }
export function POST(request: Request) { return escribirInventario(request, "programar"); }
