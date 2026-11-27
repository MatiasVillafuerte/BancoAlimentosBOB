import "server-only";
import { comprobarOrigen, leerJson, respuesta, respuestaError, usuarioActual } from "../auth/http";
import { ErrorAcceso } from "../auth/core";
import { listarCatalogo, obtenerCatalogo, servicioRegistros } from "./consultas";
import { ErrorRegistro, type Catalogo } from "./modelo";

function errorRegistro(e: unknown) {
  if (e instanceof ErrorRegistro) return respuesta({ error: e.message }, e.status);
  if (e instanceof ErrorAcceso && e.codigo === "datos") return respuesta({ error: "Envía datos JSON válidos dentro del tamaño admitido." }, 400);
  return respuestaError(e);
}
export async function consultarCatalogo(request: Request, tipo: Catalogo, id?: string) {
  try {
    const usuario = await usuarioActual();
    if (!usuario) throw new ErrorAcceso("sesion");
    const datos = id ? await obtenerCatalogo(usuario, tipo, id) : await listarCatalogo(usuario, tipo, new URL(request.url).searchParams);
    if (!datos) throw new ErrorRegistro("No se encontró el registro.", 404);
    return respuesta(datos);
  } catch (e) { return errorRegistro(e); }
}
export async function guardarRegistro(request: Request, tipo: Catalogo | "donaciones", id?: string) {
  try {
    if (!comprobarOrigen(request)) throw new ErrorRegistro("Origen de solicitud no permitido.", 403);
    const usuario = await usuarioActual();
    if (!usuario) throw new ErrorAcceso("sesion");
    const datos = await leerJson(request, tipo === "donaciones" ? 65536 : 16384);
    const servicio = await servicioRegistros();
    const resultado = id ? tipo === "usuarios" ? await servicio.editarUsuario(usuario, id, datos) :
      tipo === "donantes" || tipo === "organizaciones" ? await servicio.editarCatalogo(usuario, tipo, id, datos) :
      (() => { throw new ErrorRegistro("Las versiones de convenio y las recepciones no se sobrescriben.", 405); })() :
      tipo === "donantes" ? await servicio.crearDonante(usuario, datos) :
      tipo === "organizaciones" ? await servicio.crearOrganizacion(usuario, datos) :
      tipo === "convenios" ? await servicio.crearConvenio(usuario, datos) :
      tipo === "usuarios" ? await servicio.crearUsuario(usuario, datos) : await servicio.recibir(usuario, datos);
    return respuesta(resultado, id || ("repetida" in resultado && resultado.repetida) ? 200 : 201);
  } catch (e) { return errorRegistro(e); }
}
