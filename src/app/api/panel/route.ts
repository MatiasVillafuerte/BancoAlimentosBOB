import { usuarioActual, respuesta, respuestaError } from "@/lib/auth/http";
import { consultarPanel } from "@/lib/panel";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const usuario = await usuarioActual();
    if (!usuario) return respuesta({ error: "Inicia sesión para continuar." }, 401);
    return respuesta(await consultarPanel(usuario));
  } catch (error) { return respuestaError(error); }
}
