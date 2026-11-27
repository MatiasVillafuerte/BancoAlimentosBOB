import { createHash } from "node:crypto";
import { ObjectId, type ClientSession, type Db, type Document, type MongoClient } from "mongodb";
import { crearHash } from "../auth/password";
import type { UsuarioPublico } from "../auth/types";
import { convenioAplicable, convenioSchema, diaBolivia, donanteSchema, editarDonanteSchema, editarOrganizacionSchema,
  editarUsuarioSchema, ErrorRegistro, finDia, horaBolivia, idSchema, inicioDia, organizacionSchema,
  recepcionSchema, usuarioSchema, validar, type Catalogo } from "./modelo";

function huella(datos: unknown) { return createHash("sha256").update(JSON.stringify(datos)).digest("hex"); }
function sinCampos(d: object, campos: string[]): Document {
  return Object.fromEntries(Object.entries(d).filter(([k]) => !campos.includes(k)));
}
interface DocumentoHistorial {
  _id: ObjectId; historial?: Document[]; versionDatos?: number; actualizadaEn?: Date;
  sesiones?: Document[]; passwordHash?: string; passwordActualizadaEn?: Date;
  acceso?: { intentos: number; ventanaDesde: Date };
}
function omitirIndefinidos(d: Document): Document {
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined).map(([k, v]) =>
    [k, v && Object.getPrototypeOf(v) === Object.prototype ? omitirIndefinidos(v) : v]));
}
function idOperacion(tipo: string, autor: string, clave: string) { return new ObjectId(huella([tipo, autor, clave]).slice(0, 24)); }
const coleccionDe = (tipo: Catalogo) => tipo === "usuarios" ? "voluntarios" : tipo;
const duplicado = (e: unknown) => !!e && typeof e === "object" && "code" in e && e.code === 11000;
function versionFiltro(id: ObjectId, version: number) {
  return version === 0 ? { _id: id, $or: [{ versionDatos: 0 }, { versionDatos: { $exists: false } }] } : { _id: id, versionDatos: version };
}

// La instancia de producción se construye únicamente desde el módulo server-only.
// La conexión y Db explícitas permiten probar las transacciones en una base aislada.
export class ServicioRegistros {
  constructor(private readonly cliente: MongoClient, private readonly bd: Db, private readonly reloj = () => new Date()) {}

  private async transaccion<T>(accion: (session: ClientSession) => Promise<T>): Promise<T> {
    return this.cliente.withSession(session => session.withTransaction(() => accion(session), {
      readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary", maxCommitTimeMS: 10000,
      timeoutMS: 20000
    }));
  }
  private async autor(usuario: UsuarioPublico, session: ClientSession, permiso: "recepcion" | "gestion" | "usuarios") {
    const roles = permiso === "usuarios" ? ["administrador"] : permiso === "gestion" ? ["administrador", "coordinador"] :
      ["administrador", "coordinador", "voluntario"];
    // La escritura condicionada serializa la autorización con las bajas/cambios de rol.
    const resultado = await this.bd.collection("voluntarios").updateOne({ _id: new ObjectId(usuario.id), activo: true,
      rol: { $in: roles, $eq: usuario.rol } }, { $inc: { versionAcciones: 1 } }, { session });
    if (!resultado.matchedCount) throw new ErrorRegistro("Tu cuenta ya no tiene permiso para realizar esta acción. Actualiza la página.", 403);
  }
  private auditoria(usuario: UsuarioPublico, accion: string, fecha: Date) {
    return { modeloVersion: 2, registradaPor: new ObjectId(usuario.id), registradaEn: fecha, versionDatos: 1,
      historial: [{ accion, usuarioId: new ObjectId(usuario.id), fecha, versionDatos: 1 }] };
  }
  private async nueva(usuario: UsuarioPublico, tipo: Catalogo | "donaciones", datos: { claveOperacion: string },
    permiso: "recepcion" | "gestion" | "usuarios", crear: (id: ObjectId, session: ClientSession, ahora: Date) => Promise<Document>) {
    const coleccion = tipo === "usuarios" ? "voluntarios" : tipo;
    const id = idOperacion(tipo, usuario.id, datos.claveOperacion);
    const solicitudHash = huella(datos);
    const comprobar = (anterior: Document) => {
      if (anterior.solicitudHash !== solicitudHash || String(anterior.registradaPor) !== usuario.id) {
        throw new ErrorRegistro("Este envío ya se utilizó con otros datos. Abre un formulario nuevo para otra operación.", 409);
      }
      return { id: id.toHexString(), codigo: anterior.codigo as string | undefined, repetida: true };
    };
    try {
      return await this.transaccion(async session => {
        await this.autor(usuario, session, permiso);
        const anterior = await this.bd.collection(coleccion).findOne({ _id: id }, { session });
        if (anterior) return comprobar(anterior);
        const registro = await crear(id, session, this.reloj());
        await this.bd.collection(coleccion).insertOne(omitirIndefinidos({ ...registro, _id: id, solicitudHash,
          claveOperacion: `${usuario.id}:${datos.claveOperacion}` }), { session });
        return { id: id.toHexString(), codigo: registro.codigo as string | undefined, repetida: false };
      });
    } catch (e) {
      if (!duplicado(e)) throw e;
      // Un índice único también protege las versiones de convenio y los correos.
      // Un reintento confirmado se resuelve dentro de otra transacción autorizada.
      return this.transaccion(async session => {
        await this.autor(usuario, session, permiso);
        const anterior = await this.bd.collection(coleccion).findOne({ _id: id }, { session });
        if (anterior) return comprobar(anterior);
        throw new ErrorRegistro("El correo o la versión ya existen. Actualiza la lista antes de continuar.", 409);
      });
    }
  }
  async crearDonante(usuario: UsuarioPublico, entrada: unknown) {
    const d = validar(donanteSchema, entrada);
    if (usuario.rol === "voluntario" && (d.tipo !== "persona" || !d.activo)) {
      throw new ErrorRegistro("Voluntariado puede registrar personas donantes activas. Los otros tipos los gestiona coordinación.", 403);
    }
    return this.nueva(usuario, "donantes", d, "recepcion", async (_id, _session, ahora) => {
      const campos = sinCampos(d, ["claveOperacion"]);
      return { ...campos, ...this.auditoria(usuario, "donante_registrado", ahora), fechaRegistro: ahora };
    });
  }
  async crearOrganizacion(usuario: UsuarioPublico, entrada: unknown) {
    const d = validar(organizacionSchema, entrada);
    return this.nueva(usuario, "organizaciones", d, "gestion", async (_id, _session, ahora) => {
      const campos = sinCampos(d, ["claveOperacion"]);
      return { ...campos, ...this.auditoria(usuario, "organizacion_registrada", ahora) };
    });
  }
  async editarCatalogo(usuario: UsuarioPublico, tipo: "donantes" | "organizaciones", idTexto: string, entrada: unknown) {
    const id = new ObjectId(validar(idSchema, idTexto));
    const d = tipo === "donantes" ? validar(editarDonanteSchema, entrada) : validar(editarOrganizacionSchema, entrada);
    return this.transaccion(async session => {
      await this.autor(usuario, session, "gestion");
      const { versionDatos, ...campos } = d;
      const unset = tipo === "donantes" ? Object.fromEntries(["nit", "direccion"].filter(k => campos[k as keyof typeof campos] === undefined).map(k => [k, "" as const])) : {};
      const set = omitirIndefinidos(campos);
      const resultado = await this.bd.collection<DocumentoHistorial>(tipo).updateOne(versionFiltro(id, versionDatos), {
        $set: { ...set, versionDatos: versionDatos + 1, actualizadaEn: this.reloj() },
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
        $push: { historial: { accion: "datos_actualizados", usuarioId: new ObjectId(usuario.id), fecha: this.reloj(), versionDatos: versionDatos + 1 } }
      }, { session });
      if (!resultado.matchedCount) throw new ErrorRegistro("El registro cambió desde que lo abriste. Recarga antes de editarlo.", 409);
      return { id: idTexto };
    });
  }
  async crearConvenio(usuario: UsuarioPublico, entrada: unknown) {
    const d = validar(convenioSchema, entrada);
    return this.nueva(usuario, "convenios", d, "gestion", async (id, session, ahora) => {
      const donante = await this.bd.collection("donantes").findOneAndUpdate({ _id: new ObjectId(d.donanteId), activo: true },
        { $inc: { versionUso: 1 } }, { session, returnDocument: "after" });
      if (!donante) throw new ErrorRegistro("Selecciona un donante activo.");
      let codigo = `CONV-${id.toHexString().toUpperCase()}`;
      let version = 1;
      if (d.anteriorId) {
        const anterior = await this.bd.collection("convenios").findOne({ _id: new ObjectId(d.anteriorId), donanteId: donante._id }, { session });
        if (!anterior) throw new ErrorRegistro("La versión anterior no pertenece al donante seleccionado.");
        const ultima = await this.bd.collection("convenios").find({ codigo: anterior.codigo }, { session }).sort({ version: -1 }).limit(1).next();
        if (!ultima || !ultima._id.equals(anterior._id)) throw new ErrorRegistro("Ya existe una versión posterior. Recarga y selecciona la última.", 409);
        if (inicioDia(d.desde) < anterior.desde) throw new ErrorRegistro("La versión nueva no puede comenzar antes de la anterior.");
        codigo = anterior.codigo; version = anterior.version + 1;
      }
      return { ...this.auditoria(usuario, "convenio_version_creada", ahora), donanteId: donante._id, codigo, version,
        nombre: d.nombre, desde: inicioDia(d.desde), ...(d.hasta ? { hasta: finDia(d.hasta) } : {}),
        condiciones: d.condiciones, ...(d.periodicidad ? { periodicidad: d.periodicidad } : {}),
        ...(d.anteriorId ? { anteriorId: new ObjectId(d.anteriorId) } : {}) };
    });
  }
  async recibir(usuario: UsuarioPublico, entrada: unknown) {
    const d = validar(recepcionSchema, entrada);
    const fecha = horaBolivia(d.fechaRecepcion);
    if (fecha.getTime() > this.reloj().getTime()) throw new ErrorRegistro("La recepción registra alimentos que ya llegaron; su fecha no puede estar en el futuro.");
    return this.nueva(usuario, "donaciones", d, "recepcion", async (id, session, ahora) => {
      const donante = await this.bd.collection("donantes").findOneAndUpdate({ _id: new ObjectId(d.donanteId), activo: true },
        { $inc: { versionUso: 1 } }, { session, returnDocument: "after" });
      if (!donante) throw new ErrorRegistro("Selecciona un donante activo.");
      if (d.convenioId) {
        const convenio = await this.bd.collection("convenios").findOne({ _id: new ObjectId(d.convenioId) }, { session });
        if (!convenio || !convenioAplicable({ donanteId: convenio.donanteId, desde: convenio.desde, hasta: convenio.hasta }, d.donanteId, fecha)) {
          throw new ErrorRegistro("El convenio debe pertenecer al donante y estar vigente en la fecha de recepción.");
        }
        const vigente = await this.bd.collection("convenios").find({ codigo: convenio.codigo, donanteId: donante._id, desde: { $lte: fecha } },
          { session }).sort({ version: -1 }).limit(1).next();
        if (!vigente?._id.equals(convenio._id)) throw new ErrorRegistro("Existe una versión posterior aplicable a esta recepción. Selecciónala antes de guardar.");
      }
      const codigo = `DON-${diaBolivia(fecha).slice(0, 4)}-${id.toHexString().toUpperCase()}`;
      for (const [i, lote] of d.lotes.entries()) {
        const loteId = idOperacion("lote", id.toHexString(), String(i));
        const vencimiento = lote.fechaVencimiento ? finDia(lote.fechaVencimiento) : undefined;
        await this.bd.collection("lotes").insertOne({ _id: loteId, modeloVersion: 2, codigo: `L-${loteId.toHexString().toUpperCase()}`,
          donacionId: id, producto: lote.producto, categoria: lote.categoria, cantidad: lote.cantidad, unidad: lote.unidad,
          cantidadEnBodega: lote.cantidad, cantidadDisponible: lote.cantidad, cantidadReservada: 0,
          estado: vencimiento && vencimiento < ahora ? "vencido" : "disponible", zona: lote.zona, conservacion: lote.conservacion,
          ...(vencimiento ? { fechaVencimiento: vencimiento } : {}), ...(lote.pesoKg !== undefined ? { pesoKg: lote.pesoKg } : {}),
          atributos: { ...(lote.marca ? { marca: lote.marca } : {}), ...(lote.codigoLote ? { codigoLote: lote.codigoLote } : {}) }
        }, { session });
        await this.bd.collection("movimientos").insertOne({ _id: idOperacion("recepcion", id.toHexString(), String(i)), modeloVersion: 2,
          claveOperacion: `recepcion:${id.toHexString()}:${i}`, loteId, tipo: "recepcion", cantidad: lote.cantidad,
          unidad: lote.unidad, fecha, registradaEn: ahora, responsableId: new ObjectId(usuario.id), motivo: `Recepción ${codigo}`
        }, { session });
      }
      const pesosCompletos = d.lotes.every(lote => lote.pesoKg !== undefined);
      return { ...this.auditoria(usuario, "recepcion_registrada", ahora), codigo, donante: { donanteId: donante._id, nombre: donante.nombre },
        fechaRecepcion: fecha, estado: "por_documentar", archivos: [], revision: {},
        ...(d.convenioId ? { convenioId: new ObjectId(d.convenioId) } : {}), ...(d.observaciones ? { observaciones: d.observaciones } : {}),
        ...(pesosCompletos ? { pesoTotalKg: Math.round(d.lotes.reduce((total, lote) => total + lote.pesoKg!, 0) * 1000) / 1000 } : {}) };
    });
  }
  async crearUsuario(usuario: UsuarioPublico, entrada: unknown) {
    if (usuario.rol !== "administrador") throw new ErrorRegistro("Solo administración gestiona cuentas.", 403);
    const d = validar(usuarioSchema, entrada);
    const { passwordInicial, ...datos } = d;
    const passwordHash = await crearHash(passwordInicial);
    // La huella idempotente nunca incluye la contraseña, ni siquiera mediante un hash rápido.
    return this.nueva(usuario, "usuarios", datos, "usuarios", async (_id, _session, ahora) => {
      const campos = sinCampos(datos, ["claveOperacion"]);
      return { ...campos, ...this.auditoria(usuario, "cuenta_creada", ahora), passwordHash, passwordActualizadaEn: ahora, sesiones: [] };
    });
  }
  async editarUsuario(usuario: UsuarioPublico, idTexto: string, entrada: unknown) {
    if (usuario.rol !== "administrador") throw new ErrorRegistro("Solo administración gestiona cuentas.", 403);
    const id = new ObjectId(validar(idSchema, idTexto));
    const d = validar(editarUsuarioSchema, entrada);
    if (idTexto === usuario.id && (!d.activo || d.rol !== "administrador")) {
      throw new ErrorRegistro("No puedes desactivar tu propia cuenta ni retirar tu propio rol de administración.");
    }
    const passwordHash = d.passwordInicial ? await crearHash(d.passwordInicial) : undefined;
    try {
      return await this.transaccion(async session => {
        await this.autor(usuario, session, "usuarios");
        const anterior = await this.bd.collection("voluntarios").findOne(versionFiltro(id, d.versionDatos), { session });
        if (!anterior) throw new ErrorRegistro("La cuenta cambió desde que la abriste. Recarga antes de editarla.", 409);
        if (passwordHash && anterior.passwordHash) throw new ErrorRegistro("Esta cuenta ya tiene contraseña. Su titular debe cambiarla desde Mi cuenta.", 409);
        const { versionDatos } = d;
        const campos = sinCampos(d, ["versionDatos", "passwordInicial"]);
        const revocar = anterior.rol !== d.rol || !d.activo || !!passwordHash;
        await this.bd.collection<DocumentoHistorial>("voluntarios").updateOne({ _id: id }, { $set: { ...campos, versionDatos: versionDatos + 1,
          actualizadaEn: this.reloj(), ...(revocar ? { sesiones: [] } : {}),
          ...(passwordHash ? { passwordHash, passwordActualizadaEn: this.reloj(), acceso: { intentos: 0, ventanaDesde: this.reloj() } } : {}) },
          $push: { historial: { accion: passwordHash ? "acceso_habilitado" : "cuenta_actualizada", usuarioId: new ObjectId(usuario.id), fecha: this.reloj(), versionDatos: versionDatos + 1 } }
        }, { session });
        return { id: idTexto };
      });
    } catch (e) { if (duplicado(e)) throw new ErrorRegistro("Ya existe una cuenta con ese correo.", 409); throw e; }
  }
}

export { coleccionDe };
