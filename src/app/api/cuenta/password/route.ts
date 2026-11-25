import { cookies } from "next/headers";
import { auth, COOKIE_SESION, comprobarOrigen, establecerCookie, leerJson, respuesta, respuestaError } from "@/lib/auth/http";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!comprobarOrigen(request)) return respuesta({ error: "Origen de solicitud no permitido." }, 403);
    const cambio = await auth.cambiarPassword((await cookies()).get(COOKIE_SESION)?.value, await leerJson(request));
    const res = respuesta({ ok: true });
    establecerCookie(res, cambio.cookie, cambio.expiraEn);
    return res;
  } catch (error) { return respuestaError(error); }
}
