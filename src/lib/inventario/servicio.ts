import { createHash } from "node:crypto";
import { ObjectId, type ClientSession, type Db, type Document, type MongoClient } from "mongodb";
import type { UsuarioPublico } from "../auth/types";
import { autorizarEscritura, ejecutarTransaccion, type PermisoEscritura } from "../transacciones";
import { alcanceOperaciones } from "../operaciones/modelo";
import { ErrorRegistro, horaBolivia, idSchema, validar } from "../registros/modelo";
import { cancelarSchema, confirmarSchema, estadoLote, modificarPlanSchema, movimientoSchema, programarSchema,
  redondear, SIGNOS_MOVIMIENTO, unificarItems } from "./modelo";

const huella = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const idPara = (...partes: string[]) => new ObjectId(huella(partes).slice(0, 24));
const oid = (id: string) => new ObjectId(validar(idSchema, id));
const claveDe = (u: UsuarioPublico, clave: string) => `${u.id}:${clave}`;
interface EntregaHistorial { _id: ObjectId; historial: Document[]; versionDatos: number }
function valor(d: Document, campo: string) {
  const n = d[campo];
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) throw new ErrorRegistro("El lote tiene un saldo incompleto; requiere revisión antes de operar.", 409);
  return n;
}

export class ServicioInventario {
  constructor(private readonly cliente: MongoClient, private readonly bd: Db, private readonly reloj = () => new Date()) {}
  private async transaccion<T>(usuario: UsuarioPublico, permiso: PermisoEscritura, fn: (s: ClientSession) => Promise<T>) {
    try { return await ejecutarTransaccion(this.cliente, async s => { await autorizarEscritura(this.bd, usuario, s, permiso); return fn(s); }); }
    catch (e) {
      if (e && typeof e === "object" && "code" in e && e.code === 11000) throw new ErrorRegistro("Existe un movimiento o registro con esa referencia. Revisa el historial antes de continuar.", 409);
      throw e;
    }
  }
  private async lote(id: ObjectId, s: ClientSession) {
    const lote = await this.bd.collection("lotes").findOne({ _id: id }, { session: s });
    if (!lote) throw new ErrorRegistro("Uno de los lotes ya no está disponible.", 404);
    const fisico = valor(lote, "cantidadEnBodega"), reservado = valor(lote, "cantidadReservada");
    if (reservado > fisico || (lote.cantidadDisponible !== undefined && lote.cantidadDisponible !== fisico)) {
      throw new ErrorRegistro("El saldo del lote no es consistente. Requiere revisión antes de continuar.", 409);
    }
    return lote;
  }
  private async aptitud(lote: Document, fecha: Date, s: ClientSession) {
    const cuando = new Date(Math.max(fecha.getTime(), this.reloj().getTime()));
    if (estadoLote({ estado: lote.estado, cantidadEnBodega: lote.cantidadEnBodega, fechaVencimiento: lote.fechaVencimiento }, cuando) !== "disponible") {
      throw new ErrorRegistro(`El lote ${lote.codigo} no es apto en la fecha de entrega. Revisa estado y vencimiento.`, 409);
    }
    const donacion = await this.bd.collection("donaciones").findOne({ _id: lote.donacionId }, { session: s, projection: { fechaRecepcion: 1 } });
    if (!donacion?.fechaRecepcion || donacion.fechaRecepcion > fecha) throw new ErrorRegistro("No se puede entregar un lote antes de su recepción.");
  }
  private async guardarSaldo(lote: Document, fisico: number, reservado: number, s: ClientSession) {
    fisico = redondear(fisico); reservado = redondear(reservado);
    if (fisico < 0 || reservado < 0 || reservado > fisico) throw new ErrorRegistro(`Saldo insuficiente en ${lote.codigo}. Actualiza las cantidades.`, 409);
    const estado = estadoLote({ estado: lote.estado, cantidadEnBodega: fisico, fechaVencimiento: lote.fechaVencimiento }, this.reloj());
    const r = await this.bd.collection("lotes").updateOne({ _id: lote._id, cantidadEnBodega: lote.cantidadEnBodega, cantidadReservada: lote.cantidadReservada },
      { $set: { cantidadEnBodega: fisico, cantidadDisponible: fisico, cantidadReservada: reservado, estado }, $inc: { versionInventario: 1 } }, { session: s });
    if (!r.matchedCount) throw new ErrorRegistro("El inventario cambió. Actualiza e inténtalo otra vez.", 409);
  }
  private async referenciasPlan(d: { organizacionId: string; responsablePrevistoId: string }, s: ClientSession) {
    const organizacion = await this.bd.collection("organizaciones").findOneAndUpdate({ _id: oid(d.organizacionId), activa: true },
      { $inc: { versionUso: 1 } }, { session: s, returnDocument: "after" });
    if (!organizacion) throw new ErrorRegistro("Selecciona una organización activa.");
    const responsable = await this.bd.collection("voluntarios").updateOne({ _id: oid(d.responsablePrevistoId), activo: true,
      rol: { $in: ["administrador", "coordinador", "voluntario"] } }, { $inc: { versionAsignaciones: 1 } }, { session: s });
    if (!responsable.matchedCount) throw new ErrorRegistro("Selecciona una cuenta activa como responsable previsto.");
    return { organizacionId: organizacion._id, nombre: organizacion.nombre };
  }
  private fechaPlan(local: string) {
    const fecha = horaBolivia(local);
    if (fecha.getTime() + 60000 <= this.reloj().getTime()) throw new ErrorRegistro("La fecha programada debe ser actual o futura.");
    return fecha;
  }
  private async reservar(items: { loteId: string; cantidad: number }[], anteriores: Document[], fecha: Date, s: ClientSession) {
    const nuevas = new Map(unificarItems(items).map(i => [i.loteId, i.cantidad]));
    const previas = new Map<string, number>();
    for (const i of anteriores) previas.set(String(i.loteId), redondear((previas.get(String(i.loteId)) || 0) + i.cantidadReservada));
    const resultado: Document[] = [];
    for (const id of [...new Set([...nuevas.keys(), ...previas.keys()])].sort()) {
      const lote = await this.lote(oid(id), s);
      const cantidad = nuevas.get(id) || 0, previa = previas.get(id) || 0;
      if (previa > lote.cantidadReservada) throw new ErrorRegistro("Las reservas del lote requieren conciliación.", 409);
      if (cantidad > 0) await this.aptitud(lote, fecha, s);
      await this.guardarSaldo(lote, lote.cantidadEnBodega, lote.cantidadReservada - previa + cantidad, s);
      if (cantidad > 0) resultado.push({ loteId: lote._id, unidad: lote.unidad, cantidadProgramada: cantidad, cantidadReservada: cantidad, cantidadEntregada: 0 });
    }
    return resultado;
  }
  private comprobarReintento(registro: Document, solicitudHash: string) {
    if (registro.solicitudHash !== solicitudHash) throw new ErrorRegistro("La clave del envío ya se usó con otros datos. Actualiza el formulario.", 409);
  }
  async programar(usuario: UsuarioPublico, entrada: unknown) {
    const datos = validar(programarSchema, entrada);
    const d = { ...datos, items: unificarItems(datos.items) };
    const id = idPara("entrega", usuario.id, d.claveOperacion), solicitudHash = huella(d);
    return this.transaccion(usuario, "gestion", async s => {
      const anterior = await this.bd.collection("entregas").findOne({ _id: id }, { session: s });
      if (anterior) { this.comprobarReintento(anterior, solicitudHash); return { id: String(id), repetida: true }; }
      const fecha = this.fechaPlan(d.fechaProgramada);
      const organizacion = await this.referenciasPlan(d, s);
      const items = await this.reservar(d.items, [], fecha, s);
      const ahora = this.reloj();
      await this.bd.collection("entregas").insertOne({ _id: id, modeloVersion: 2, codigo: `ENT-${d.fechaProgramada.slice(0, 4)}-${String(id).toUpperCase()}`,
        organizacion, fechaProgramada: fecha, responsablePrevistoId: oid(d.responsablePrevistoId), lugar: d.lugar,
        beneficiariosPrevistos: d.beneficiariosPrevistos, observaciones: d.observaciones || "", items,
        estado: "programada", requiereReasignacion: false, archivos: [], revision: {}, versionDatos: 1,
        registradaPor: oid(usuario.id), registradaEn: ahora, claveOperacion: claveDe(usuario, d.claveOperacion), solicitudHash,
        historial: [{ accion: "entrega_programada", usuarioId: oid(usuario.id), fecha: ahora, versionDatos: 1 }]
      }, { session: s });
      return { id: String(id), repetida: false };
    });
  }
  private async entrega(usuario: UsuarioPublico, id: string, s: ClientSession) {
    const d = await this.bd.collection("entregas").findOne({ _id: oid(id), ...alcanceOperaciones(usuario, "entregas") }, { session: s });
    if (!d) throw new ErrorRegistro("No se encontró una entrega disponible para tu cuenta.", 404);
    return d;
  }
  private accionAnterior(entrega: Document, usuario: UsuarioPublico, clave: string, accion: string, datos: unknown) {
    const evento = (entrega.historial || []).find((h: Document) => h.claveOperacion === claveDe(usuario, clave));
    if (!evento) return false;
    if (evento.accion !== accion || evento.solicitudHash !== huella(datos)) throw new ErrorRegistro("La clave del envío corresponde a otra acción o contenido.", 409);
    return true;
  }
  private planEditable(d: Document, version: number) {
    if (d.estado !== "programada") throw new ErrorRegistro("Solo una entrega programada admite esta acción. Una salida realizada se corrige mediante movimientos.", 409);
    if (d.versionDatos !== version) throw new ErrorRegistro("La entrega cambió desde que la abriste. Recarga antes de continuar.", 409);
  }
  private async actualizarEntrega(entrega: Document, usuario: UsuarioPublico, accion: string, clave: string, datos: unknown,
    campos: Document, detalle: string, s: ClientSession) {
    const versionDatos = entrega.versionDatos + 1;
    const evento = { accion, usuarioId: oid(usuario.id), fecha: this.reloj(), versionDatos, detalle, claveOperacion: claveDe(usuario, clave), solicitudHash: huella(datos) };
    const r = await this.bd.collection<EntregaHistorial>("entregas").updateOne({ _id: entrega._id, versionDatos: entrega.versionDatos },
      { $set: { ...campos, versionDatos }, $push: { historial: evento } }, { session: s });
    if (!r.matchedCount) throw new ErrorRegistro("La entrega fue modificada por otra operación. Recarga.", 409);
  }
  async modificar(usuario: UsuarioPublico, id: string, entrada: unknown) {
    const datos = validar(modificarPlanSchema, entrada), d = { ...datos, items: unificarItems(datos.items) };
    return this.transaccion(usuario, "gestion", async s => {
      const entrega = await this.entrega(usuario, id, s);
      if (this.accionAnterior(entrega, usuario, d.claveOperacion, "programacion_modificada", d)) return { id, repetida: true };
      this.planEditable(entrega, d.versionDatos);
      const fecha = this.fechaPlan(d.fechaProgramada);
      const organizacion = await this.referenciasPlan(d, s);
      const items = await this.reservar(d.items, entrega.items, fecha, s);
      await this.actualizarEntrega(entrega, usuario, "programacion_modificada", d.claveOperacion, d, {
        organizacion, fechaProgramada: fecha, lugar: d.lugar, responsablePrevistoId: oid(d.responsablePrevistoId),
        beneficiariosPrevistos: d.beneficiariosPrevistos, observaciones: d.observaciones || "", items, requiereReasignacion: false
      }, d.motivo, s);
      return { id, repetida: false };
    });
  }
  async cancelar(usuario: UsuarioPublico, id: string, entrada: unknown) {
    const d = validar(cancelarSchema, entrada);
    return this.transaccion(usuario, "gestion", async s => {
      const entrega = await this.entrega(usuario, id, s);
      if (this.accionAnterior(entrega, usuario, d.claveOperacion, "entrega_cancelada", d)) return { id, repetida: true };
      this.planEditable(entrega, d.versionDatos);
      await this.reservar([], entrega.items, this.reloj(), s);
      await this.actualizarEntrega(entrega, usuario, "entrega_cancelada", d.claveOperacion, d,
        { estado: "cancelada", requiereReasignacion: false, items: entrega.items.map((i: Document) => ({ ...i, cantidadReservada: 0 })) }, d.motivo, s);
      return { id, repetida: false };
    });
  }
  async confirmar(usuario: UsuarioPublico, id: string, entrada: unknown) {
    const d = validar(confirmarSchema, entrada);
    return this.transaccion(usuario, "recepcion", async s => {
      const entrega = await this.entrega(usuario, id, s);
      if (this.accionAnterior(entrega, usuario, d.claveOperacion, "entrega_confirmada", d)) return { id, repetida: true };
      this.planEditable(entrega, d.versionDatos);
      if (entrega.requiereReasignacion || entrega.items.some((i: Document) => i.cantidadReservada < (i.cantidadProgramada ?? i.cantidadReservada))) {
        throw new ErrorRegistro("La entrega requiere reasignación. Coordinación debe ajustar primero la programación.", 409);
      }
      const fecha = horaBolivia(d.fechaEntrega), ahora = this.reloj();
      if (fecha > ahora || (entrega.registradaEn && fecha.getTime() + 60000 < entrega.registradaEn.getTime())) {
        throw new ErrorRegistro("La fecha real no puede ser futura ni anterior a la creación de esta programación.");
      }
      const reales = new Map(d.items.map(i => [i.loteId, i]));
      if (reales.size !== d.items.length || reales.size !== entrega.items.length || entrega.items.some((i: Document) => !reales.has(String(i.loteId)))) {
        throw new ErrorRegistro("Indica una cantidad real por cada lote programado, sin añadir ni repetir lotes.");
      }
      const items: Document[] = [];
      for (const i of [...entrega.items].sort((a, b) => String(a.loteId).localeCompare(String(b.loteId)))) {
        const real = reales.get(String(i.loteId))!;
        if (real.cantidad > i.cantidadReservada) throw new ErrorRegistro("La cantidad entregada no puede superar la reserva. Ajusta primero la programación.", 409);
        const lote = await this.lote(i.loteId, s);
        if (i.unidad !== lote.unidad || i.cantidadReservada > lote.cantidadReservada) throw new ErrorRegistro("La unidad o reserva del lote no coincide con la programación.", 409);
        if (real.cantidad > 0) await this.aptitud(lote, fecha, s);
        await this.guardarSaldo(lote, lote.cantidadEnBodega - real.cantidad, lote.cantidadReservada - i.cantidadReservada, s);
        if (real.cantidad > 0) await this.bd.collection("movimientos").insertOne({
          _id: idPara("salida", id, String(i.loteId)), modeloVersion: 2, claveOperacion: `entrega:${id}:${i.loteId}`,
          loteId: i.loteId, entregaId: entrega._id, tipo: "entrega", cantidad: real.cantidad, unidad: i.unidad,
          fecha, registradaEn: ahora, responsableId: oid(usuario.id), motivo: `Entrega ${entrega.codigo}`
        }, { session: s });
        items.push({ loteId: i.loteId, unidad: i.unidad, ...(i.cantidadProgramada !== undefined ? { cantidadProgramada: i.cantidadProgramada } : {}),
          cantidadReservada: 0, cantidadEntregada: real.cantidad, ...(real.cantidad > 0 && real.pesoKg ? { pesoKg: real.pesoKg } : {}) });
      }
      const conSalida = d.items.filter(i => i.cantidad > 0);
      const peso = conSalida.every(i => i.pesoKg !== undefined) ? redondear(conSalida.reduce((n, i) => n + i.pesoKg!, 0)) : undefined;
      await this.actualizarEntrega(entrega, usuario, "entrega_confirmada", d.claveOperacion, d, {
        estado: "por_documentar", fechaEntrega: fecha, entregadaPor: oid(usuario.id), recibidoPor: d.recibidoPor, lugar: d.lugar,
        beneficiariosAtendidos: d.beneficiariosAtendidos, observaciones: d.observaciones ?? entrega.observaciones ?? "",
        items, requiereReasignacion: false, revision: {}, ...(peso !== undefined ? { pesoTotalKg: peso } : {})
      }, "Salida real confirmada. Se libera toda reserva remanente.", s);
      // Un peso legado previsto no acredita el peso real si no se midieron todos los lotes.
      if (peso === undefined) await this.bd.collection("entregas").updateOne({ _id: entrega._id }, { $unset: { pesoTotalKg: "" } }, { session: s });
      return { id, repetida: false };
    });
  }
  async registrarMovimiento(usuario: UsuarioPublico, entrada: unknown) {
    const d = validar(movimientoSchema, entrada);
    const id = idPara("movimiento", usuario.id, d.claveOperacion), solicitudHash = huella(d);
    return this.transaccion(usuario, d.tipo.startsWith("ajuste") ? "usuarios" : "gestion", async s => {
      const repetido = await this.bd.collection("movimientos").findOne({ _id: id }, { session: s });
      if (repetido) { this.comprobarReintento(repetido, solicitudHash); return { id: String(id), repetida: true }; }
      const lote = await this.lote(oid(d.loteId), s);
      let original: Document | null = null;
      if (d.origenId) {
        original = await this.bd.collection("movimientos").findOne({ _id: oid(d.origenId), loteId: lote._id }, { session: s });
        if (!original || original.unidad !== lote.unidad) throw new ErrorRegistro("El movimiento original debe corresponder al mismo lote y unidad.");
      }
      const signo = SIGNOS_MOVIMIENTO[d.tipo];
      if (d.tipo === "devolucionEntrada" || d.tipo === "devolucionSalida") {
        const tipoOrigen = d.tipo === "devolucionEntrada" ? "entrega" : "recepcion";
        if (original?.tipo !== tipoOrigen) throw new ErrorRegistro(`Selecciona una ${tipoOrigen === "entrega" ? "salida por entrega" : "entrada por recepción"} como origen.`);
        const vinculados = await this.bd.collection("movimientos").find({ origenId: original._id }, { session: s }).toArray();
        const correccion = vinculados.filter(m => m.tipo.startsWith("ajuste")).reduce((n, m) => n + SIGNOS_MOVIMIENTO[m.tipo] * m.cantidad, 0);
        const efectiva = redondear(original.cantidad + SIGNOS_MOVIMIENTO[original.tipo] * correccion);
        const devuelto = redondear(vinculados.filter(m => m.tipo === d.tipo).reduce((n, m) => n + m.cantidad, 0));
        if (redondear(devuelto + d.cantidad) > efectiva) throw new ErrorRegistro("La devolución supera la cantidad original pendiente de devolver.", 409);
      }
      if (d.tipo.startsWith("ajuste")) {
        if (!original || !["recepcion", "entrega", "merma"].includes(original.tipo)) throw new ErrorRegistro("La corrección debe referirse a una recepción, entrega o merma original.");
        const vinculados = await this.bd.collection("movimientos").find({ origenId: original._id }, { session: s }).toArray();
        const neto = vinculados.filter(m => m.tipo.startsWith("ajuste")).reduce((n, m) => n + SIGNOS_MOVIMIENTO[m.tipo] * m.cantidad, 0) + signo * d.cantidad;
        const efectiva = redondear(original.cantidad + SIGNOS_MOVIMIENTO[original.tipo] * neto);
        const devuelto = redondear(vinculados.filter(m => m.tipo.startsWith("devolucion")).reduce((n, m) => n + m.cantidad, 0));
        if (efectiva < 0 || efectiva < devuelto) throw new ErrorRegistro("La corrección dejaría una cantidad original negativa o menor que la ya devuelta.", 409);
        if (original.tipo === "recepcion" || original.tipo === "entrega") {
          const coleccion = original.tipo === "recepcion" ? "donaciones" : "entregas";
          const expedienteId = original.tipo === "recepcion" ? lote.donacionId : original.entregaId;
          const expediente = await this.bd.collection(coleccion).findOne({ _id: expedienteId }, { session: s });
          if (!expediente) throw new ErrorRegistro("No se encontró el expediente del movimiento original.", 409);
          if (expediente.estado === "completada") throw new ErrorRegistro("El expediente está completado. Requiere reapertura administrativa antes de corregir cantidades.", 409);
          const versionDatos = expediente.versionDatos + 1;
          const r = await this.bd.collection<EntregaHistorial>(coleccion).updateOne({ _id: expediente._id, versionDatos: expediente.versionDatos, estado: expediente.estado }, {
            $set: { versionDatos, estado: expediente.estado === "observada" ? "observada" : "por_documentar", revision: expediente.estado === "observada" ? expediente.revision : {} },
            $push: { historial: { accion: "cantidad_corregida", usuarioId: oid(usuario.id), fecha: this.reloj(), versionDatos,
              detalle: `${d.motivo}. Movimiento compensatorio ${id}; se conserva la cantidad original.`, revisionAnterior: expediente.revision || {},
              movimientoId: id, claveOperacion: claveDe(usuario, d.claveOperacion) } }
          }, { session: s });
          if (!r.matchedCount) throw new ErrorRegistro("El expediente cambió durante la corrección. Recarga antes de continuar.", 409);
        }
      }
      const retornoNoApto = d.tipo === "devolucionEntrada" && !d.reincorporar;
      if (d.tipo === "devolucionEntrada" && d.reincorporar && ["vencido", "descartado"].includes(
        estadoLote({ estado: lote.estado, cantidadEnBodega: lote.cantidadEnBodega, fechaVencimiento: lote.fechaVencimiento }, this.reloj()))) {
        throw new ErrorRegistro("Este lote está vencido o descartado. Registra la devolución sin reincorporarlo para distribución.", 409);
      }
      const fisico = redondear(lote.cantidadEnBodega + (retornoNoApto ? 0 : signo * d.cantidad));
      if (fisico < 0) throw new ErrorRegistro("La salida supera el saldo físico del lote.", 409);
      if (new Set(d.reducciones.map(r => r.entregaId)).size !== d.reducciones.length) throw new ErrorRegistro("No repitas una entrega al reducir reservas.");
      if (signo > 0 && d.reducciones.length) throw new ErrorRegistro("Una entrada no necesita liberar reservas.");
      let liberado = 0;
      for (const reduccion of [...d.reducciones].sort((a, b) => a.entregaId.localeCompare(b.entregaId))) {
        const entrega = await this.entrega(usuario, reduccion.entregaId, s);
        this.planEditable(entrega, reduccion.versionDatos);
        const linea = entrega.items.find((i: Document) => String(i.loteId) === d.loteId);
        if (!linea || reduccion.cantidad > linea.cantidadReservada) throw new ErrorRegistro("La reducción supera la reserva de esa entrega para este lote.", 409);
        const items = entrega.items.map((i: Document) => String(i.loteId) === d.loteId ? { ...i, cantidadReservada: redondear(i.cantidadReservada - reduccion.cantidad) } : i);
        await this.actualizarEntrega(entrega, usuario, "reserva_reducida_por_movimiento", d.claveOperacion, d,
          { items, requiereReasignacion: true }, `${d.motivo}. Se liberan ${reduccion.cantidad} ${lote.unidad} de ${lote.codigo}. Movimiento ${id}.`, s);
        liberado = redondear(liberado + reduccion.cantidad);
      }
      if (liberado > lote.cantidadReservada || redondear(lote.cantidadReservada - liberado) > fisico) {
        throw new ErrorRegistro("La pérdida afecta productos reservados. Elige las entregas a reducir hasta dejar las reservas dentro del saldo físico.", 409);
      }
      await this.guardarSaldo(lote, fisico, lote.cantidadReservada - liberado, s);
      await this.bd.collection("movimientos").insertOne({ _id: id, modeloVersion: 2, claveOperacion: claveDe(usuario, d.claveOperacion), solicitudHash,
        loteId: lote._id, tipo: d.tipo, cantidad: d.cantidad, unidad: lote.unidad, fecha: this.reloj(), registradaEn: this.reloj(),
        responsableId: oid(usuario.id), motivo: d.motivo, ...(original ? { origenId: original._id } : {}),
        ...(original?.entregaId ? { entregaId: original.entregaId } : {}),
        ...(d.tipo === "devolucionEntrada" ? { reincorporar: d.reincorporar } : {}), reducciones: d.reducciones.map(r => ({ ...r, entregaId: oid(r.entregaId) }))
      }, { session: s });
      if (retornoNoApto) await this.bd.collection("movimientos").insertOne({ _id: idPara("retorno-no-apto", String(id)), modeloVersion: 2,
        claveOperacion: `retorno-no-apto:${id}`, loteId: lote._id, tipo: "merma", cantidad: d.cantidad, unidad: lote.unidad,
        fecha: this.reloj(), registradaEn: this.reloj(), responsableId: oid(usuario.id), origenId: id,
        motivo: `Devolución no apta, sin reincorporación al inventario disponible. ${d.motivo}`
      }, { session: s });
      return { id: String(id), repetida: false };
    });
  }
}
