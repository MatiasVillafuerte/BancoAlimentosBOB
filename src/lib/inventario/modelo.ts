import { z } from "zod";
import { ErrorRegistro, idSchema, instanteLocal } from "../registros/modelo";

export const TIPOS_MOVIMIENTO = ["recepcion", "entrega", "merma", "devolucionEntrada", "devolucionSalida", "ajusteEntrada", "ajusteSalida"] as const;
export const ETIQUETAS_MOVIMIENTO: Record<string, string> = { recepcion: "Recepción", entrega: "Entrega", merma: "Merma",
  devolucionEntrada: "Devolución recibida", devolucionSalida: "Devolución al donante", ajusteEntrada: "Corrección de entrada", ajusteSalida: "Corrección de salida" };
export const SIGNOS_MOVIMIENTO: Record<string, number> = { recepcion: 1, entrega: -1, merma: -1, devolucionEntrada: 1, devolucionSalida: -1, ajusteEntrada: 1, ajusteSalida: -1 };
const noNegativa = z.number().finite().min(0).max(1_000_000).refine(n => Math.abs(n * 1000 - Math.round(n * 1000)) < 0.000001, "Utiliza como máximo tres decimales.");
const positiva = noNegativa.refine(n => n > 0, "La cantidad debe ser mayor que cero.");
const texto = (max: number) => z.string().trim().min(1, "Completa los campos obligatorios.").max(max);
const clave = z.string().uuid();
const version = z.number().int().min(1);
const basePlan = { organizacionId: idSchema, fechaProgramada: instanteLocal, lugar: texto(300),
  responsablePrevistoId: idSchema, beneficiariosPrevistos: z.number().int().min(0).max(1_000_000),
  observaciones: z.string().trim().max(3000).optional(),
  items: z.array(z.object({ loteId: idSchema, cantidad: positiva }).strict()).min(1).max(30) };
export const programarSchema = z.object({ claveOperacion: clave, ...basePlan }).strict();
export const modificarPlanSchema = z.object({ claveOperacion: clave, versionDatos: version, motivo: texto(1000), ...basePlan }).strict();
export const cancelarSchema = z.object({ claveOperacion: clave, versionDatos: version, motivo: texto(1000) }).strict();
export const confirmarSchema = z.object({ claveOperacion: clave, versionDatos: version, fechaEntrega: instanteLocal,
  recibidoPor: texto(160), lugar: texto(300), beneficiariosAtendidos: z.number().int().min(0).max(1_000_000),
  observaciones: z.string().trim().max(3000).optional(),
  items: z.array(z.object({ loteId: idSchema, cantidad: noNegativa, pesoKg: positiva.optional() }).strict()).min(1).max(30)
}).strict().refine(d => d.items.some(i => i.cantidad > 0), "Debe existir al menos una cantidad realmente entregada; si no hubo salida, cancela la programación.");
export const movimientoSchema = z.object({ claveOperacion: clave, loteId: idSchema, cantidad: positiva,
  tipo: z.enum(["merma", "devolucionEntrada", "devolucionSalida", "ajusteEntrada", "ajusteSalida"]),
  motivo: texto(1000), origenId: idSchema.optional(), reincorporar: z.boolean().optional(),
  reducciones: z.array(z.object({ entregaId: idSchema, versionDatos: version, cantidad: positiva }).strict()).max(100).default([])
}).strict().refine(d => d.tipo === "merma" || !!d.origenId, "Selecciona el movimiento original que respalda esta devolución o corrección.")
  .refine(d => d.tipo !== "devolucionEntrada" || typeof d.reincorporar === "boolean", "Indica si los productos devueltos son aptos para reincorporarse.")
  .refine(d => d.tipo === "devolucionEntrada" || d.reincorporar === undefined, "La condición de reincorporación solo corresponde a devoluciones recibidas.");

export function redondear(n: number) { return Math.round(n * 1000) / 1000; }
export function unificarItems(items: { loteId: string; cantidad: number }[]) {
  const mapa = new Map<string, number>();
  for (const i of items) mapa.set(i.loteId, redondear((mapa.get(i.loteId) || 0) + i.cantidad));
  if ([...mapa.values()].some(n => n > 1_000_000)) throw new ErrorRegistro("La suma por lote supera el límite admitido.");
  return [...mapa].sort(([a], [b]) => a.localeCompare(b)).map(([loteId, cantidad]) => ({ loteId, cantidad }));
}
export function estadoLote(lote: { estado: string; cantidadEnBodega: number; fechaVencimiento?: Date | null }, ahora: Date) {
  if (lote.estado === "descartado") return "descartado";
  if (lote.estado === "vencido" || (lote.fechaVencimiento && lote.fechaVencimiento < ahora)) return "vencido";
  if (lote.cantidadEnBodega <= 0) return "agotado";
  return lote.estado === "agotado" ? "disponible" : lote.estado;
}
export interface LoteVista {
  id: string; codigo: string; producto: string; categoria: string; unidad: string; zona: string; conservacion: string;
  cantidadRecibida: number; enBodega: number; reservada: number; libre: number; estado: string; vencimiento: string | null;
  proximoAVencer: boolean; donacionId: string; atributos: Record<string, string>; pesoKg: number | null;
}
export interface MovimientoVista {
  id: string; loteId: string; tipo: string; cantidad: number; unidad: string; fecha: string; motivo: string;
  responsable: { nombre: string; id: string } | null; origenId: string | null; entregaId: string | null;
  ajusteNeto: number; devuelto: number; cantidadEfectiva: number;
}
export interface ReservaVista { entregaId: string; codigo: string; fechaProgramada: string; organizacion: string; cantidad: number; programada: number | null; versionDatos: number }
export interface DetalleLote { lote: LoteVista; reservas: ReservaVista[]; reservasVisibles: number; movimientos: MovimientoVista[];
  pagina: number; paginas: number; totalMovimientos: number; saldoMovimientos: number; conciliado: boolean; puedeVerDonacion: boolean }
export interface ListadoInventario { registros: LoteVista[]; total: number; pagina: number; paginas: number }

export function leerFiltrosInventario(params: URLSearchParams, fefo = false) {
  const permitidos = ["q", "zona", "estado", "pagina", "fecha"];
  for (const k of params.keys()) if (!permitidos.includes(k) || params.getAll(k).length !== 1) throw new ErrorRegistro("Filtros de inventario no válidos.");
  const q = (params.get("q") || "").trim();
  const zona = params.get("zona") || "";
  const estado = params.get("estado") || "";
  const pagina = params.get("pagina") || "1";
  const fecha = params.get("fecha") || "";
  if (q.length > 80 || !["", "Z1", "Z2", "Z3", "Z4"].includes(zona) ||
    !["", "disponible", "agotado", "vencido", "descartado", "proximo"].includes(estado) ||
    !/^[1-9]\d{0,3}$/.test(pagina) || Number(pagina) > 1000 || (fecha && !instanteLocal.safeParse(fecha).success) || (fefo && estado)) {
    throw new ErrorRegistro("Revisa la zona, estado, fecha y página de la consulta.");
  }
  return { q, zona, estado, pagina: Number(pagina), fecha };
}
