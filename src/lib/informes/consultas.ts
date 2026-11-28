import { ObjectId, type Db, type Document, type MongoClient, type ClientSession } from "mongodb";
import type { UsuarioPublico } from "../auth/types";
import { alcanceOperaciones } from "../operaciones/modelo";
import { ErrorRegistro } from "../registros/modelo";
import { ejecutarTransaccion } from "../transacciones";
import { agruparCantidades, cantidadesMovimiento, periodoInforme, resumenOperaciones } from "./modelo";

const proyeccion = { codigo: 1, estado: 1, fechaRecepcion: 1, fechaEntrega: 1, fechaProgramada: 1, items: 1,
  pesoTotalKg: 1, beneficiariosAtendidos: 1, revision: 1, versionDatos: 1, "organizacion.nombre": 1 };
const camposMovimiento = { loteId: 1, entregaId: 1, origenId: 1, tipo: 1, cantidad: 1, unidad: 1 };
export class ConsultasInformes {
  constructor(private readonly cliente: MongoClient, private readonly bd: Db, private readonly reloj = () => new Date()) {}
  private async vigencia(u: UsuarioPublico, session: ClientSession) {
    if (!await this.bd.collection("voluntarios").findOne({ _id: new ObjectId(u.id), activo: true, rol: u.rol }, { session, projection: { _id: 1 } })) throw new ErrorRegistro("Tu cuenta ya no tiene acceso. Inicia sesión nuevamente.", 403);
  }
  async resumen(u: UsuarioPublico, params: URLSearchParams) {
    const periodo = periodoInforme(params, this.reloj());
    return ejecutarTransaccion(this.cliente, async session => {
      await this.vigencia(u, session);
      const secciones = [];
      for (const tipo of ["donaciones", "entregas"] as const) {
        const entrega = tipo === "entregas", fecha = entrega ? "fechaEntrega" : "fechaRecepcion";
        const operaciones = await this.bd.collection(tipo).find({ ...alcanceOperaciones(u, tipo),
          [fecha]: { $gte: periodo.inicio, $lt: periodo.fin } }, { session, projection: proyeccion }).limit(501).toArray();
        if (operaciones.length > 500) throw new ErrorRegistro("Hay más de 500 operaciones por sección. Reduce el período para obtener el informe completo.");
        const lotes = await this.bd.collection("lotes").find(entrega ? { _id: { $in: operaciones.flatMap(o => (o.items || []).map((i: Document) => i.loteId)) } } :
          { donacionId: { $in: operaciones.map(o => o._id) } }, { session, projection: { producto: 1, donacionId: 1 } }).limit(15001).toArray();
        if (lotes.length > 15000) throw new ErrorRegistro("Reduce el período: supera los 15000 lotes admitidos por informe.");
        const originales = await this.bd.collection("movimientos").find({ tipo: entrega ? "entrega" : "recepcion",
          ...(entrega ? { entregaId: { $in: operaciones.map(o => o._id) } } : { loteId: { $in: lotes.map(l => l._id) } }) },
          { session, projection: camposMovimiento }).limit(15001).toArray();
        if (originales.length > 15000) throw new ErrorRegistro("Reduce el período: demasiados movimientos originales.");
        const relacionados = await this.relacionados(originales, session);
        const conMovimiento = new Set(originales.map(m => entrega ? `${m.entregaId}:${m.loteId}` : String(m.loteId)));
        const faltantes = entrega ? operaciones.reduce((n, o) => n + (o.items || []).filter((i: Document) => i.cantidadEntregada > 0 &&
          !conMovimiento.has(`${o._id}:${i.loteId}`)).length, 0) : lotes.filter(l => !conMovimiento.has(String(l._id))).length;
        secciones.push({ tipo, ...resumenOperaciones(operaciones, entrega), cantidades: agruparCantidades(originales, relacionados, lotes), lineasSinMovimiento: faltantes });
      }
      return { desde: periodo.desde, hasta: periodo.hasta, consultadoEn: this.reloj().toISOString(),
        alcance: u.rol === "administrador" ? "Todas las operaciones" : u.rol === "coordinador" ? "Tus recepciones y todas las entregas" : "Tus recepciones y las entregas propias, asignadas o realizadas", secciones };
    });
  }
  private async relacionados(originales: Document[], session: ClientSession) {
    const r = await this.bd.collection("movimientos").find({ origenId: { $in: originales.map(m => m._id) } }, { session, projection: camposMovimiento }).limit(60001).toArray();
    if (r.length > 60000) throw new ErrorRegistro("La consulta supera el límite de 60000 movimientos relacionados. Reduce el período.");
    return r;
  }
  async trazabilidad(u: UsuarioPublico, codigo: string) {
    if (!/^[A-Z0-9-]{3,80}$/.test(codigo)) return null;
    return ejecutarTransaccion(this.cliente, async session => {
      await this.vigencia(u, session);
      const e = await this.bd.collection("entregas").findOne({ codigo, ...alcanceOperaciones(u, "entregas") }, { session, projection: proyeccion });
      if (!e) return null;
      const lotes = await this.bd.collection("lotes").find({ _id: { $in: (e.items || []).map((i: Document) => i.loteId) } },
        { session, projection: { codigo: 1, producto: 1, unidad: 1, donacionId: 1, zona: 1 } }).toArray();
      const donaciones = await this.bd.collection("donaciones").find({ _id: { $in: lotes.map(l => l.donacionId) }, ...alcanceOperaciones(u, "donaciones") },
        { session, projection: { codigo: 1, donante: 1, convenioId: 1, fechaRecepcion: 1, estado: 1 } }).toArray();
      const convenios = await this.bd.collection("convenios").find({ _id: { $in: donaciones.map(d => d.convenioId).filter(id => id instanceof ObjectId) } },
        { session, projection: { codigo: 1, version: 1, donanteId: 1 } }).toArray();
      const movimientos = await this.bd.collection("movimientos").find({ entregaId: e._id, tipo: "entrega" }, { session, projection: camposMovimiento }).toArray();
      const relacionados = await this.relacionados(movimientos, session);
      return { id: String(e._id), codigo: e.codigo as string, estado: e.estado as string, organizacion: e.organizacion?.nombre as string,
        fecha: e.fechaEntrega instanceof Date ? e.fechaEntrega.toISOString() : null,
        lineas: ((e.items || []) as Document[]).map(i => {
          const l = lotes.find(l => String(l._id) === String(i.loteId));
          const d = l && donaciones.find(d => String(d._id) === String(l.donacionId));
          const c = d && convenios.find(c => String(c._id) === String(d.convenioId) && String(c.donanteId) === String(d.donante?.donanteId));
          const m = movimientos.find(m => String(m.loteId) === String(i.loteId));
          return { lote: l ? { id: String(l._id), codigo: l.codigo as string, producto: l.producto as string, zona: l.zona as string } : null,
            unidad: i.unidad as string, programada: i.cantidadProgramada as number | undefined,
            cantidades: m ? cantidadesMovimiento(m, relacionados) : null,
            salidaRegistrada: e.fechaEntrega instanceof Date ? (i.cantidadEntregada ?? null) as number | null : null,
            donacion: d ? { id: String(d._id), codigo: d.codigo as string, donante: d.donante?.nombre as string,
              fecha: d.fechaRecepcion instanceof Date ? d.fechaRecepcion.toISOString() : null, estado: d.estado as string,
              convenio: c ? { id: String(c._id), codigo: c.codigo as string, version: c.version as number } : null,
              convenioPendiente: !!d.convenioId && !c } : null };
        }) };
    });
  }
}
