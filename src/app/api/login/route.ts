import { auth, comprobarOrigen, establecerCookie, leerJson, respuesta, respuestaError } from "@/lib/auth/http";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!comprobarOrigen(request)) return respuesta({ error: "Origen de solicitud no permitido." }, 403);
    const acceso = await auth.ingresar(await leerJson(request));
    const res = respuesta({ usuario: acceso.usuario });
    establecerCookie(res, acceso.cookie, acceso.expiraEn);
    return res;
  } catch (error) { return respuestaError(error); }
}
