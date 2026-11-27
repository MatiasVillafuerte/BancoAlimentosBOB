import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { ErrorAcceso, ServicioAutenticacion } from "./core";
import { AlmacenMongo } from "./mongo-store";
import { origenPermitido } from "./origin";

export const COOKIE_SESION = "bab_session";
export const auth = new ServicioAutenticacion(new AlmacenMongo());

export function origenAplicacion() {
  const url = new URL(process.env.APP_URL || "http://localhost:3000");
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("APP_URL inválida");
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("APP_URL requiere HTTPS fuera del equipo local");
  }
  return url;
}

export function comprobarOrigen(request: Request) {
  return origenPermitido(request.headers.get("origin"), origenAplicacion());
}

export async function leerJson(request: Request, limiteBytes = 8192) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new ErrorAcceso("datos");
  // Limitar también la lectura real; Content-Length puede faltar o ser falso.
  const reader = request.body?.getReader();
  if (!reader) throw new ErrorAcceso("datos");
  const trozos: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limiteBytes) { await reader.cancel(); throw new ErrorAcceso("datos"); }
      trozos.push(value);
    }
    return JSON.parse(Buffer.concat(trozos).toString("utf8"));
  } catch { throw new ErrorAcceso("datos"); }
  finally { reader.releaseLock(); }
}

export function respuesta(datos: unknown, status = 200) {
  return NextResponse.json(datos, { status, headers: { "Cache-Control": "no-store" } });
}
export function establecerCookie(res: NextResponse, valor: string, expires: Date) {
  res.cookies.set(COOKIE_SESION, valor, { httpOnly: true, sameSite: "lax",
    secure: origenAplicacion().protocol === "https:", path: "/", expires });
}
export function respuestaError(error: unknown) {
  if (error instanceof ErrorAcceso) {
    if (error.codigo === "credenciales") return respuesta({ error: "No pudimos iniciar sesión. Revisa tus datos; si hiciste varios intentos, espera 15 minutos." }, 401);
    if (error.codigo === "sesion") return respuesta({ error: "Tu sesión terminó. Vuelve a ingresar." }, 401);
    if (error.codigo === "password") return respuesta({ error: "No pudimos verificar la contraseña actual. Si hiciste varios intentos, espera 15 minutos." }, 400);
    return respuesta({ error: "Revisa los datos. La nueva contraseña debe tener entre 15 y 128 caracteres y coincidir con su confirmación." }, 400);
  }
  const codigo = error && typeof error === "object" && "code" in error && (typeof error.code === "number" || (typeof error.code === "string" && /^[A-Z0-9_]{1,60}$/.test(error.code))) ? error.code : undefined;
  console.error("[BAB] Fallo de acceso", { tipo: error instanceof Error ? error.name : "Error", codigo });
  return respuesta({ error: "El servicio no está disponible en este momento. Inténtalo nuevamente." }, 503);
}
export async function usuarioActual() {
  return auth.usuarioActual((await cookies()).get(COOKIE_SESION)?.value);
}
export async function exigirUsuario() {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/login");
  return usuario;
}
