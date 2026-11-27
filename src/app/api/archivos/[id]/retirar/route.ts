import { retirarArchivo } from "@/lib/documentos/http";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { return retirarArchivo(request, (await params).id); }
