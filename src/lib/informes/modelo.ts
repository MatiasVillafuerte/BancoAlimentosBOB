import type { Document } from "mongodb";
import { ErrorRegistro } from "../registros/modelo";
import { redondear, SIGNOS_MOVIMIENTO } from "../inventario/modelo";

export function periodoInforme(params: URLSearchParams, ahora = new Date()) {
  for (const k of params.keys()) if (!["desde", "hasta"].includes(k) || params.getAll(k).length !== 1) throw new ErrorRegistro("Filtros de informe no válidos.");
  const hoy = new Date(ahora.getTime() - 4 * 3600000).toISOString().slice(0, 10);
  const desde = params.get("desde") ?? `${hoy.slice(0, 7)}-01`, hasta = params.get("hasta") ?? hoy;
  const valido = (s: string) => /^20\d{2}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  if (!valido(desde) || !valido(hasta)) throw new ErrorRegistro("Indica fechas válidas entre 2000 y 2099.");
  const inicio = new Date(`${desde}T00:00:00-04:00`), fin = new Date(Date.parse(`${hasta}T00:00:00-04:00`) + 86400000);
  if (fin <= inicio || fin.getTime() - inicio.getTime() > 366 * 86400000) throw new ErrorRegistro("El período debe tener entre 1 y 366 días.");
  return { desde, hasta, inicio, fin };
}

/** Correcciones posteriores se atribuyen al movimiento original; una devolución no lo borra. */
export function cantidadesMovimiento(original: Document, relacionados: Document[]) {
  const propios = relacionados.filter(m => String(m.origenId) === String(original._id) && String(m.loteId) === String(original.loteId) && m.unidad === original.unidad);
  const ajuste = propios.filter(m => ["ajusteEntrada", "ajusteSalida"].includes(m.tipo)).reduce((s, m) => s + SIGNOS_MOVIMIENTO[m.tipo] * m.cantidad, 0);
  const corregida = redondear(original.cantidad + SIGNOS_MOVIMIENTO[original.tipo] * ajuste);
  const devuelta = redondear(propios.filter(m => m.tipo === (original.tipo === "recepcion" ? "devolucionSalida" : "devolucionEntrada")).reduce((s, m) => s + m.cantidad, 0));
  return { original: original.cantidad as number, corregida, devuelta, neta: redondear(corregida - devuelta) };
}

export function resumenOperaciones(operaciones: Document[], entrega: boolean) {
  const peso = operaciones.filter(o => typeof o.pesoTotalKg === "number" && Number.isFinite(o.pesoTotalKg));
  const atenciones = entrega ? operaciones.filter(o => typeof o.beneficiariosAtendidos === "number") : [];
  const aprobadas = operaciones.filter(o => o.estado === "completada" && o.revision?.revisadaEn instanceof Date && o.revision?.revisadaPor && o.revision?.rolAlRevisar === "administrador" && o.revision?.versionRevisada === o.versionDatos).length;
  return { operaciones: operaciones.length, aprobadas, pendientes: operaciones.length - aprobadas,
    pesoKgRegistrado: peso.length ? redondear(peso.reduce((s, o) => s + o.pesoTotalKg, 0)) : null, operacionesConPeso: peso.length,
    atenciones: atenciones.length ? atenciones.reduce((s, o) => s + o.beneficiariosAtendidos, 0) : null, operacionesConAtenciones: atenciones.length };
}

export function agruparCantidades(originales: Document[], relacionados: Document[], lotes: Document[]) {
  const porId = new Map(lotes.map(l => [String(l._id), l]));
  const porOrigen = new Map<string, Document[]>();
  for (const r of relacionados) {
    const k = String(r.origenId), grupo = porOrigen.get(k);
    if (grupo) grupo.push(r); else porOrigen.set(k, [r]);
  }
  const grupos = new Map<string, { producto: string; unidad: string; original: number; corregida: number; devuelta: number; neta: number }>();
  for (const m of originales) {
    const producto = porId.get(String(m.loteId))?.producto || "Producto sin registro", unidad = m.unidad || "Unidad sin registro";
    const clave = JSON.stringify([producto, unidad]), q = cantidadesMovimiento(m, porOrigen.get(String(m._id)) || []);
    const g = grupos.get(clave) || { producto, unidad, original: 0, corregida: 0, devuelta: 0, neta: 0 };
    for (const k of ["original", "corregida", "devuelta", "neta"] as const) g[k] = redondear(g[k] + q[k]);
    grupos.set(clave, g);
  }
  return [...grupos.values()].sort((a, b) => a.producto.localeCompare(b.producto, "es") || a.unidad.localeCompare(b.unidad, "es"));
}
