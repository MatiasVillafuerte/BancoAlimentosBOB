import { cookies } from "next/headers";
import { auth, COOKIE_SESION, comprobarOrigen, establecerCookie, respuesta, respuestaError } from "@/lib/auth/http";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!comprobarOrigen(request)) return respuesta({ error: "Origen de solicitud no permitido." }, 403);
    await auth.salir((await cookies()).get(COOKIE_SESION)?.value);
    const res = respuesta({ ok: true });
    establecerCookie(res, "", new Date(0));
    return res;
  } catch (error) { return respuestaError(error); }
}
