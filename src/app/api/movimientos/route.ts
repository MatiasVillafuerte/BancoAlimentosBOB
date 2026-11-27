import { consultarInventario, escribirInventario } from "@/lib/inventario/http";
export const runtime = "nodejs";
export function GET(request: Request) { return consultarInventario(request, "movimientos"); }
export function POST(request: Request) { return escribirInventario(request, "movimiento"); }
