import "server-only";
import { comprobarOrigen, leerJson, respuesta, respuestaError, usuarioActual } from "../auth/http";
import { ErrorAcceso } from "../auth/core";
import { obtenerBase, obtenerCliente } from "../db";
import { ErrorRegistro } from "../registros/modelo";
import { ServicioInventario } from "./servicio";
import { ConsultasInventario } from "./lecturas";

export async function consultasInventario() { return new ConsultasInventario(await obtenerBase()); }
function error(e: unknown) {
  if (e instanceof ErrorRegistro) return respuesta({ error: e.message }, e.status);
  if (e instanceof ErrorAcceso && e.codigo === "datos") return respuesta({ error: "Envía datos válidos dentro del tamaño admitido." }, 400);
  return respuestaError(e);
}
export async function consultarInventario(request: Request, tipo: "lotes" | "fefo" | "responsables" | "movimientos", id?: string) {
  try {
    const usuario = await usuarioActual();
    if (!usuario) throw new ErrorAcceso("sesion");
    const consultas = await consultasInventario(), params = new URL(request.url).searchParams;
    if (tipo === "responsables") return respuesta({ registros: await consultas.responsables(usuario) });
    if (id || tipo === "movimientos") {
      const permitidos = tipo === "movimientos" ? ["loteId", "pagina"] : ["pagina"];
      for (const k of params.keys()) if (!permitidos.includes(k) || params.getAll(k).length !== 1) throw new ErrorRegistro("Filtros no válidos.");
      const pagina = params.get("pagina") || "1";
      if (!/^[1-9]\d{0,3}$/.test(pagina)) throw new ErrorRegistro("Página no válida.");
      const detalle = await consultas.detalle(usuario, id || params.get("loteId") || "", Number(pagina));
      if (!detalle) throw new ErrorRegistro("No se encontró el lote.", 404);
      return respuesta(tipo === "movimientos" ? { registros: detalle.movimientos, total: detalle.totalMovimientos, pagina: detalle.pagina, paginas: detalle.paginas } : detalle);
    }
    return respuesta(await consultas.listar(params, tipo === "fefo"));
  } catch (e) { return error(e); }
}
export async function escribirInventario(request: Request, accion: "programar" | "modificar" | "confirmar" | "cancelar" | "movimiento", id = "") {
  try {
    if (!comprobarOrigen(request)) throw new ErrorRegistro("Origen de solicitud no permitido.", 403);
    const usuario = await usuarioActual();
    if (!usuario) throw new ErrorAcceso("sesion");
    const datos = await leerJson(request, 65536);
    const servicio = new ServicioInventario(await obtenerCliente(), await obtenerBase());
    const resultado = accion === "programar" ? await servicio.programar(usuario, datos) :
      accion === "modificar" ? await servicio.modificar(usuario, id, datos) :
      accion === "cancelar" ? await servicio.cancelar(usuario, id, datos) :
      accion === "confirmar" ? await servicio.confirmar(usuario, id, datos) : await servicio.registrarMovimiento(usuario, datos);
    return respuesta(resultado, resultado.repetida || ["modificar", "cancelar", "confirmar"].includes(accion) ? 200 : 201);
  } catch (e) { return error(e); }
}
