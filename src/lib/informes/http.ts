import "server-only";
import { usuarioActual, respuesta, respuestaError } from "../auth/http";
import { ErrorAcceso } from "../auth/core";
import { obtenerBase, obtenerCliente } from "../db";
import { ErrorRegistro } from "../registros/modelo";
import { ConsultasInformes } from "./consultas";
export async function consultasInformes() { return new ConsultasInformes(await obtenerCliente(), await obtenerBase()); }
export async function consultarInforme(request: Request, tipo: "resumen" | "trazabilidad", codigo?: string) {
  try {
    const u = await usuarioActual(); if (!u) throw new ErrorAcceso("sesion");
    const consultas = await consultasInformes(), params = new URL(request.url).searchParams;
    if (tipo === "trazabilidad" && params.size) throw new ErrorRegistro("La trazabilidad no admite filtros adicionales.");
    const r = tipo === "resumen" ? await consultas.resumen(u, params) : await consultas.trazabilidad(u, codigo || "");
    if (!r) throw new ErrorRegistro("No se encontró la entrega disponible para tu cuenta.", 404);
    return respuesta(r);
  } catch (e) { return e instanceof ErrorRegistro ? respuesta({ error: e.message }, e.status) : respuestaError(e); }
}
