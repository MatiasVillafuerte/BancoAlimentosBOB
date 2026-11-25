import { usuarioActual, respuesta, respuestaError } from "@/lib/auth/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const usuario = await usuarioActual();
    return usuario ? respuesta({ usuario }) : respuesta({ error: "Inicia sesión para continuar." }, 401);
  } catch (error) { return respuestaError(error); }
}
