import { actuarDocumentacion } from "@/lib/documentos/http";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { return actuarDocumentacion(request, "entregas", (await params).id, "enviar"); }
