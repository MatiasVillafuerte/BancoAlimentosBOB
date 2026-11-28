import { consultarInforme } from "@/lib/informes/http";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ codigo: string }> }) { return consultarInforme(request, "trazabilidad", (await params).codigo); }
