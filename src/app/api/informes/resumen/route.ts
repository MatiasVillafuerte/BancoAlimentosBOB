import { consultarInforme } from "@/lib/informes/http";
export const runtime = "nodejs";
export async function GET(request: Request) { return consultarInforme(request, "resumen"); }
