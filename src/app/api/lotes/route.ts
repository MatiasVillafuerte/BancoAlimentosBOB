import { consultarInventario } from "@/lib/inventario/http";
export const runtime = "nodejs";
export function GET(request: Request) { return consultarInventario(request, "lotes"); }
