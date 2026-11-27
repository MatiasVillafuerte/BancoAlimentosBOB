import { z } from "zod";
import type { Rol } from "../auth/types";

export const CATALOGOS = ["donantes", "organizaciones", "convenios", "usuarios"] as const;
export type Catalogo = typeof CATALOGOS[number];
export const TIPOS_DONANTE = ["persona", "empresa", "mercado", "productor"] as const;
export const CATEGORIAS = ["fresco", "no perecedero", "lácteo", "limpieza", "otro"] as const;
export const ZONAS_RECEPCION = { Z1: "Secos", Z2: "Panificados", Z3: "Refrigerados", Z4: "No alimentos" } as const;
export const ROLES_REGISTRO = ["voluntario", "coordinador", "administrador"] as const;
export class ErrorRegistro extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
export function puedeGestionar(rol: Rol) { return rol === "administrador" || rol === "coordinador"; }
const texto = (max = 160) => z.string().trim().min(1, "Completa los campos obligatorios.").max(max);
const opcional = (max = 160) => z.string().trim().max(max).transform(v => v || undefined).optional();
export const idSchema = z.string().regex(/^[a-f0-9]{24}$/, "La referencia seleccionada no es válida.");
const clave = z.string().uuid("La solicitud perdió su identificador. Recarga el formulario.");
const fechaDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Revisa la fecha.").refine(v => {
  const f = new Date(v + "T12:00:00Z");
  return Number.isFinite(f.getTime()) && f.toISOString().slice(0, 10) === v;
}, "La fecha no existe.");
const instanteLocal = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).refine(v => {
  const [dia, hora] = v.split("T");
  return fechaDia.safeParse(dia).success && /^([01]\d|2[0-3]):[0-5]\d$/.test(hora);
}, "La fecha y hora no son válidas.");
const cantidad = z.number().finite().positive().max(1_000_000).refine(v => Math.abs(v * 1000 - Math.round(v * 1000)) < 0.000001,
  "Utiliza como máximo tres decimales.");
const correo = z.string().trim().toLowerCase().email("Revisa el correo electrónico.").max(254);
const contacto = z.object({ nombre: opcional(), telefono: opcional(40), email: correo.optional(), funcion: opcional(), medio: opcional() }).strict();
const donanteCampos = {
  tipo: z.enum(TIPOS_DONANTE), nombre: texto(), nit: opcional(40), direccion: opcional(300), contacto,
  activo: z.boolean()
};
const organizacionCampos = {
  nombre: texto(), tipo: texto(80), direccion: texto(300), zona: texto(100),
  responsable: z.object({ nombre: texto(), telefono: texto(40) }).strict(),
  poblacion: z.object({ ninos: z.number().int().min(0).max(1_000_000), adultosMayores: z.number().int().min(0).max(1_000_000),
    total: z.number().int().min(0).max(1_000_000) }).strict(), activa: z.boolean()
};
const poblacionValida = (v: { poblacion: { ninos: number; adultosMayores: number; total: number } }) =>
  v.poblacion.ninos + v.poblacion.adultosMayores <= v.poblacion.total;
export const donanteSchema = z.object({ ...donanteCampos, claveOperacion: clave }).strict();
export const editarDonanteSchema = z.object({ ...donanteCampos, versionDatos: z.number().int().min(0) }).strict();
export const organizacionSchema = z.object({ ...organizacionCampos, claveOperacion: clave }).strict().refine(poblacionValida,
  "La suma de niños y adultos mayores no puede superar la población total.");
export const editarOrganizacionSchema = z.object({ ...organizacionCampos, versionDatos: z.number().int().min(0) }).strict().refine(poblacionValida,
  "La suma de niños y adultos mayores no puede superar la población total.");
export const convenioSchema = z.object({ claveOperacion: clave, donanteId: idSchema, anteriorId: idSchema.optional(),
  nombre: texto(), desde: fechaDia, hasta: fechaDia.optional(), condiciones: texto(6000), periodicidad: opcional(300)
}).strict().refine(v => !v.hasta || v.hasta >= v.desde, "El fin de vigencia debe ser igual o posterior al inicio.");
export const loteSchema = z.object({ producto: texto(), categoria: z.enum(CATEGORIAS), cantidad,
  unidad: texto(40), zona: z.enum(["Z1", "Z2", "Z3", "Z4"]), conservacion: z.enum(["ambiente", "refrigerado"]),
  fechaVencimiento: fechaDia.optional(), pesoKg: cantidad.optional(), marca: opcional(100), codigoLote: opcional(100)
}).strict().refine(v => v.conservacion !== "refrigerado" || v.zona === "Z3", "Un producto refrigerado debe ingresar en Z3.")
  .refine(v => v.categoria !== "limpieza" || v.zona === "Z4", "Los productos de limpieza deben ingresar en Z4, separados de los alimentos.")
  .refine(v => !["fresco", "no perecedero", "lácteo"].includes(v.categoria) || v.zona !== "Z4", "Z4 está destinada a productos no alimentarios.");
export const recepcionSchema = z.object({ claveOperacion: clave, donanteId: idSchema, convenioId: idSchema.optional(),
  fechaRecepcion: instanteLocal, observaciones: opcional(3000), lotes: z.array(loteSchema).min(1).max(30)
}).strict();
const usuarioCampos = { nombre: texto(), email: correo, telefono: texto(40), rol: z.enum(ROLES_REGISTRO), activo: z.boolean() };
export const usuarioSchema = z.object({ ...usuarioCampos, claveOperacion: clave,
  passwordInicial: z.string().min(15, "La contraseña inicial debe tener al menos 15 caracteres.").max(128) }).strict();
export const editarUsuarioSchema = z.object({ ...usuarioCampos, versionDatos: z.number().int().min(0),
  passwordInicial: z.string().min(15).max(128).optional() }).strict();

export function validar<T>(schema: z.ZodType<T>, entrada: unknown): T {
  const res = schema.safeParse(entrada);
  if (!res.success) throw new ErrorRegistro(res.error.issues[0]?.message || "Revisa los datos.");
  return res.data;
}
export function inicioDia(dia: string) { return new Date(dia + "T00:00:00-04:00"); }
export function finDia(dia: string) { return new Date(dia + "T23:59:59.999-04:00"); }
export function horaBolivia(local: string) { return new Date(local + ":00-04:00"); }
export function diaBolivia(ahora: Date) { return new Date(ahora.getTime() - 4 * 3600000).toISOString().slice(0, 10); }
export function convenioAplicable(c: { donanteId: unknown; desde?: Date; hasta?: Date }, donanteId: string, fecha: Date) {
  return String(c.donanteId) === donanteId && c.desde instanceof Date && c.desde <= fecha &&
    (!c.hasta || (c.hasta instanceof Date && finDia(diaBolivia(c.hasta)) >= fecha));
}
export interface FichaCatalogo {
  id: string; nombre: string; versionDatos: number;
  tipo?: string; activo?: boolean; nit?: string; direccion?: string; contacto?: Record<string, string>;
  zona?: string; responsable?: { nombre: string; telefono: string }; poblacion?: { ninos: number; adultosMayores: number; total: number };
  codigo?: string; version?: number; donanteId?: string; donanteNombre?: string; desde?: string; hasta?: string; condiciones?: string; periodicidad?: string; tienePdf?: boolean;
  email?: string; telefono?: string; rol?: Rol; tieneAcceso?: boolean;
}
