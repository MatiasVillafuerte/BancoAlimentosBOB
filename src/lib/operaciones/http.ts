import "server-only";
import { usuarioActual, respuesta, respuestaError } from "../auth/http";
import { listarOperaciones, obtenerFicha } from "./consultas";
import { ErrorConsulta, leerFiltros, type TipoConsulta, type TipoOperacion } from "./modelo";

export async function responderListado(request: Request, tipo: TipoConsulta) {
  try {
    const usuario = await usuarioActual();
    if (!usuario) return respuesta({ error: "Inicia sesión para continuar." }, 401);
    const filtros = leerFiltros(new URL(request.url).searchParams, tipo);
    return respuesta(await listarOperaciones(usuario, tipo, filtros));
  } catch (error) {
    if (error instanceof ErrorConsulta) return respuesta({ error: error.message }, 400);
    return respuestaError(error);
  }
}
export async function responderFicha(tipo: TipoOperacion, id: string) {
  try {
    const usuario = await usuarioActual();
    if (!usuario) return respuesta({ error: "Inicia sesión para continuar." }, 401);
    const ficha = await obtenerFicha(usuario, tipo, id);
    return ficha ? respuesta(ficha) : respuesta({ error: "No encontramos una operación disponible para tu cuenta." }, 404);
  } catch (error) { return respuestaError(error); }
}
