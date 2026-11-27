import { servirArchivo } from "@/lib/documentos/http";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { return servirArchivo(request, (await params).id); }
