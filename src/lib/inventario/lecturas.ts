import { ObjectId, type Db, type Document } from "mongodb";
import type { UsuarioPublico } from "../auth/types";
import { alcanceOperaciones } from "../operaciones/modelo";
import { ErrorRegistro, horaBolivia } from "../registros/modelo";
import { estadoLote, leerFiltrosInventario, redondear, SIGNOS_MOVIMIENTO, type DetalleLote, type ListadoInventario, type LoteVista, type MovimientoVista } from "./modelo";

const signoExpr = { $switch: { branches: Object.entries(SIGNOS_MOVIMIENTO).map(([tipo, signo]) => ({ case: { $eq: ["$tipo", tipo] }, then: signo })), default: 0 } };
function lotePublico(d: Document, ahora: Date): LoteVista {
  const estado = estadoLote({ estado: d.estado, cantidadEnBodega: d.cantidadEnBodega, fechaVencimiento: d.fechaVencimiento }, ahora);
  return { id: String(d._id), codigo: d.codigo, producto: d.producto, categoria: d.categoria, unidad: d.unidad,
    zona: d.zona, conservacion: d.conservacion, cantidadRecibida: d.cantidad, enBodega: d.cantidadEnBodega,
    reservada: d.cantidadReservada, libre: redondear(d.cantidadEnBodega - d.cantidadReservada), estado,
    vencimiento: d.fechaVencimiento instanceof Date ? d.fechaVencimiento.toISOString() : null,
    proximoAVencer: estado === "disponible" && d.fechaVencimiento instanceof Date && d.fechaVencimiento.getTime() <= ahora.getTime() + 7 * 86400000,
    donacionId: String(d.donacionId), pesoKg: typeof d.pesoKg === "number" ? d.pesoKg : null,
    atributos: Object.fromEntries(Object.entries(d.atributos || {}).filter(([, v]) => ["string", "number", "boolean"].includes(typeof v)).map(([k, v]) => [k, String(v)])) };
}
export class ConsultasInventario {
  constructor(private readonly bd: Db, private readonly reloj = () => new Date()) {}
  async listar(params: URLSearchParams, fefo = false): Promise<ListadoInventario> {
    const f = leerFiltrosInventario(params, fefo), ahora = this.reloj();
    const fecha = f.fecha ? horaBolivia(f.fecha) : ahora;
    const aptoHasta = new Date(Math.max(ahora.getTime(), fecha.getTime()));
    const filtro: Document = {};
    if (f.zona) filtro.zona = f.zona;
    if (f.q) { const rx = { $regex: f.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" }; filtro.$or = [{ codigo: rx }, { producto: rx }, { "atributos.marca": rx }]; }
    const etapas: Document[] = [{ $match: filtro }, { $set: { estadoActual: { $switch: { branches: [
      { case: { $eq: ["$estado", "descartado"] }, then: "descartado" },
      { case: { $or: [{ $eq: ["$estado", "vencido"] }, { $and: [{ $eq: [{ $type: "$fechaVencimiento" }, "date"] }, { $lt: ["$fechaVencimiento", ahora] }] }] }, then: "vencido" },
      { case: { $lte: ["$cantidadEnBodega", 0] }, then: "agotado" }
    ], default: { $cond: [{ $eq: ["$estado", "agotado"] }, "disponible", "$estado"] } } }, sinFecha: { $cond: [{ $eq: [{ $type: "$fechaVencimiento" }, "date"] }, 0, 1] } } }];
    if (f.estado === "proximo") etapas.push({ $match: { estadoActual: "disponible", fechaVencimiento: { $lte: new Date(ahora.getTime() + 7 * 86400000) } } });
    else if (f.estado) etapas.push({ $match: { estadoActual: f.estado } });
    if (fefo) etapas.push({ $match: { estadoActual: "disponible", $expr: { $gt: ["$cantidadEnBodega", "$cantidadReservada"] },
      $or: [{ fechaVencimiento: { $exists: false } }, { fechaVencimiento: { $gte: aptoHasta } }] } });
    etapas.push({ $facet: { registros: [{ $sort: { sinFecha: 1, fechaVencimiento: 1, codigo: 1, _id: 1 } }, { $skip: (f.pagina - 1) * 20 }, { $limit: 20 },
      { $project: { codigo: 1, producto: 1, categoria: 1, unidad: 1, zona: 1, conservacion: 1, cantidad: 1, cantidadEnBodega: 1,
        cantidadReservada: 1, estado: 1, fechaVencimiento: 1, donacionId: 1, atributos: 1, pesoKg: 1 } }], total: [{ $count: "n" }] } });
    const [r] = await this.bd.collection("lotes").aggregate<{ registros: Document[]; total: { n: number }[] }>(etapas).toArray();
    const total = r?.total[0]?.n || 0;
    return { registros: (r?.registros || []).map(d => lotePublico(d, ahora)), total, pagina: f.pagina, paginas: Math.ceil(total / 20) };
  }
  async detalle(usuario: UsuarioPublico, id: string, pagina = 1): Promise<DetalleLote | null> {
    if (!/^[a-f0-9]{24}$/.test(id)) return null;
    if (!Number.isInteger(pagina) || pagina < 1 || pagina > 1000) throw new ErrorRegistro("Página de movimientos no válida.");
    const _id = new ObjectId(id), lote = await this.bd.collection("lotes").findOne({ _id });
    if (!lote) return null;
    const filtroReservas = { estado: "programada", items: { $elemMatch: { loteId: _id, cantidadReservada: { $gt: 0 } } } };
    const [reservas, registros, totalMovimientos, saldo, reservaTotal, donacion] = await Promise.all([
      this.bd.collection("entregas").find({ ...filtroReservas, ...alcanceOperaciones(usuario, "entregas") },
        { projection: { codigo: 1, "organizacion.nombre": 1, fechaProgramada: 1, items: 1, versionDatos: 1 } }).sort({ fechaProgramada: 1 }).limit(100).toArray(),
      this.bd.collection("movimientos").find({ loteId: _id }, { projection: { tipo: 1, cantidad: 1, unidad: 1, fecha: 1, motivo: 1, responsableId: 1, origenId: 1, entregaId: 1, loteId: 1 } })
        .sort({ fecha: -1, _id: -1 }).skip((pagina - 1) * 20).limit(20).toArray(),
      this.bd.collection("movimientos").countDocuments({ loteId: _id }),
      this.bd.collection("movimientos").aggregate<{ saldo: number }>([{ $match: { loteId: _id } }, { $group: { _id: null, saldo: { $sum: { $multiply: ["$cantidad", signoExpr] } } } }]).toArray(),
      this.bd.collection("entregas").aggregate<{ reserva: number }>([{ $match: filtroReservas }, { $unwind: "$items" }, { $match: { "items.loteId": _id } },
        { $group: { _id: null, reserva: { $sum: "$items.cantidadReservada" } } }]).toArray(),
      this.bd.collection("donaciones").findOne({ _id: lote.donacionId, ...alcanceOperaciones(usuario, "donaciones") }, { projection: { _id: 1 } })
    ]);
    const [personas, relacionados, entregasVisibles] = await Promise.all([
      this.bd.collection("voluntarios").find({ _id: { $in: registros.map(m => m.responsableId) } }, { projection: { nombre: 1 } }).toArray(),
      this.bd.collection("movimientos").find({ origenId: { $in: registros.map(m => m._id) } }, { projection: { origenId: 1, tipo: 1, cantidad: 1 } }).toArray(),
      this.bd.collection("entregas").find({ _id: { $in: registros.map(m => m.entregaId).filter(id => id instanceof ObjectId) }, ...alcanceOperaciones(usuario, "entregas") }, { projection: { _id: 1 } }).toArray()
    ]);
    const autorizadas = new Set(entregasVisibles.map(e => String(e._id)));
    const movimientos: MovimientoVista[] = registros.map(m => {
      const vinculados = relacionados.filter(r => String(r.origenId) === String(m._id));
      const ajusteNeto = redondear(vinculados.filter(r => r.tipo.startsWith("ajuste")).reduce((n, r) => n + SIGNOS_MOVIMIENTO[r.tipo] * r.cantidad, 0));
      const p = personas.find(p => String(p._id) === String(m.responsableId));
      return { id: String(m._id), loteId: id, tipo: m.tipo, cantidad: m.cantidad, unidad: m.unidad, fecha: m.fecha.toISOString(), motivo: m.motivo,
        responsable: p ? { id: String(p._id), nombre: p.nombre } : null, origenId: m.origenId ? String(m.origenId) : null,
        entregaId: m.entregaId && autorizadas.has(String(m.entregaId)) ? String(m.entregaId) : null,
        ajusteNeto, devuelto: redondear(vinculados.filter(r => r.tipo.startsWith("devolucion")).reduce((n, r) => n + r.cantidad, 0)),
        cantidadEfectiva: redondear(m.cantidad + SIGNOS_MOVIMIENTO[m.tipo] * ajusteNeto) };
    });
    const saldoMovimientos = redondear(saldo[0]?.saldo || 0);
    return { lote: lotePublico(lote, this.reloj()), movimientos, totalMovimientos, pagina, paginas: Math.ceil(totalMovimientos / 20),
      saldoMovimientos, conciliado: saldoMovimientos === redondear(lote.cantidadEnBodega) && redondear(reservaTotal[0]?.reserva || 0) === redondear(lote.cantidadReservada),
      puedeVerDonacion: !!donacion, reservasVisibles: reservas.length,
      reservas: reservas.map(r => { const i = r.items.find((i: Document) => String(i.loteId) === id); return { entregaId: String(r._id), codigo: r.codigo,
        organizacion: r.organizacion.nombre, fechaProgramada: r.fechaProgramada.toISOString(), cantidad: i.cantidadReservada,
        programada: i.cantidadProgramada ?? null, versionDatos: r.versionDatos }; }) };
  }
  async responsables(usuario: UsuarioPublico) {
    if (usuario.rol === "voluntario") throw new ErrorRegistro("Solo coordinación y administración asignan responsables.", 403);
    const datos = await this.bd.collection("voluntarios").find({ activo: true }, { projection: { nombre: 1, rol: 1 } }).sort({ nombre: 1 }).limit(500).toArray();
    return datos.map(d => ({ id: String(d._id), nombre: d.nombre as string, rol: d.rol as string }));
  }
}
