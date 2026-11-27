import { actuarDocumentacion } from "@/lib/documentos/http";
export const runtime = "nodejs";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { return actuarDocumentacion(request, "donaciones", (await params).id, "corregir"); }
