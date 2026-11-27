import "server-only";
import { ObjectId, type Document } from "mongodb";
import { obtenerBase, obtenerCliente } from "../db";
import type { UsuarioPublico } from "../auth/types";
import { ServicioRegistros, coleccionDe } from "./servicio";
import { ErrorRegistro, diaBolivia, type Catalogo, type FichaCatalogo } from "./modelo";

const proyecciones: Record<Catalogo, Document> = {
  donantes: { nombre: 1, tipo: 1, nit: 1, direccion: 1, contacto: 1, activo: 1, versionDatos: 1 },
  organizaciones: { nombre: 1, tipo: 1, direccion: 1, zona: 1, responsable: 1, poblacion: 1, activa: 1, versionDatos: 1 },
  convenios: { codigo: 1, nombre: 1, donanteId: 1, version: 1, desde: 1, hasta: 1, condiciones: 1, periodicidad: 1, pdfId: 1 },
  usuarios: { nombre: 1, email: 1, telefono: 1, rol: 1, activo: 1, versionDatos: 1,
    tieneAcceso: { $eq: [{ $type: "$passwordHash" }, "string"] } }
};
function texto(v: unknown) { return typeof v === "string" ? v : ""; }
function campoFecha(v: unknown) { return v instanceof Date ? diaBolivia(v) : undefined; }
function ficha(tipo: Catalogo, d: Document, donantes: Map<string, string>): FichaCatalogo {
  const base = { id: String(d._id), nombre: texto(d.nombre), versionDatos: typeof d.versionDatos === "number" ? d.versionDatos : 0 };
  if (tipo === "donantes") return { ...base, tipo: texto(d.tipo), nit: texto(d.nit), direccion: texto(d.direccion), activo: d.activo === true,
    contacto: Object.fromEntries(["nombre", "telefono", "email", "funcion", "medio"].map(k => [k, texto(d.contacto?.[k])])) };
  if (tipo === "organizaciones") return { ...base, tipo: texto(d.tipo), direccion: texto(d.direccion), zona: texto(d.zona), activo: d.activa === true,
    responsable: { nombre: texto(d.responsable?.nombre), telefono: texto(d.responsable?.telefono) },
    poblacion: { ninos: d.poblacion?.ninos ?? 0, adultosMayores: d.poblacion?.adultosMayores ?? 0, total: d.poblacion?.total ?? 0 } };
  if (tipo === "convenios") return { ...base, codigo: texto(d.codigo), version: d.version, donanteId: String(d.donanteId),
    donanteNombre: donantes.get(String(d.donanteId)) || "Donante no disponible", desde: campoFecha(d.desde), hasta: campoFecha(d.hasta),
    condiciones: texto(d.condiciones), periodicidad: texto(d.periodicidad), tienePdf: d.pdfId instanceof ObjectId };
  return { ...base, email: texto(d.email), telefono: texto(d.telefono), rol: d.rol, activo: d.activo === true, tieneAcceso: d.tieneAcceso === true };
}
export async function servicioRegistros() { return new ServicioRegistros(await obtenerCliente(), await obtenerBase()); }
export async function listarCatalogo(usuario: UsuarioPublico, tipo: Catalogo, params: URLSearchParams) {
  if (tipo === "usuarios" && usuario.rol !== "administrador") throw new ErrorRegistro("Solo administración puede consultar las cuentas.", 403);
  const permitidos = ["q", "pagina", "activo", "donanteId"];
  if ([...params.keys()].some(k => !permitidos.includes(k) || params.getAll(k).length !== 1)) throw new ErrorRegistro("Filtros no válidos.");
  const q = (params.get("q") || "").trim();
  const pag = params.get("pagina") || "1";
  const activo = params.get("activo") || "";
  if (q.length > 80 || !/^[1-9]\d{0,3}$/.test(pag) || !["", "si", "no"].includes(activo)) throw new ErrorRegistro("Revisa los filtros.");
  const filtro: Document = {};
  if (q) {
    const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filtro.$or = [{ nombre: rx }, ...(tipo === "convenios" ? [{ codigo: rx }] : tipo === "usuarios" ? [{ email: rx }] : [])];
  }
  if (activo && tipo !== "convenios") filtro[tipo === "organizaciones" ? "activa" : "activo"] = activo === "si";
  const donanteId = params.get("donanteId");
  if (donanteId) {
    if (tipo !== "convenios" || !/^[a-f0-9]{24}$/.test(donanteId)) throw new ErrorRegistro("Donante no válido.");
    filtro.donanteId = new ObjectId(donanteId);
  }
  const bd = await obtenerBase();
  const pagina = Number(pag);
  const coleccion = bd.collection(coleccionDe(tipo));
  const [datos, total] = await Promise.all([
    coleccion.find(filtro, { projection: proyecciones[tipo] }).sort(tipo === "convenios" ? { codigo: 1, version: -1 } : { nombre: 1, _id: 1 }).skip((pagina - 1) * 20).limit(20).toArray(),
    coleccion.countDocuments(filtro)
  ]);
  const ids = datos.map(d => d.donanteId).filter(v => v instanceof ObjectId);
  const donantes = tipo === "convenios" && ids.length ? await bd.collection("donantes").find({ _id: { $in: ids } }, { projection: { nombre: 1 } }).toArray() : [];
  return { registros: datos.map(d => ficha(tipo, d, new Map(donantes.map(d => [String(d._id), texto(d.nombre)])))), total, pagina, paginas: Math.ceil(total / 20) };
}
export async function obtenerCatalogo(usuario: UsuarioPublico, tipo: Catalogo, id: string) {
  if (tipo === "usuarios" && usuario.rol !== "administrador") throw new ErrorRegistro("Solo administración puede consultar las cuentas.", 403);
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const bd = await obtenerBase();
  const d = await bd.collection(coleccionDe(tipo)).findOne({ _id: new ObjectId(id) }, { projection: proyecciones[tipo] });
  if (!d) return null;
  const donante = tipo === "convenios" ? await bd.collection("donantes").findOne({ _id: d.donanteId }, { projection: { nombre: 1 } }) : null;
  return ficha(tipo, d, donante ? new Map([[String(d.donanteId), texto(donante.nombre)]]) : new Map());
}
