import { z } from "zod";
import { idSchema } from "../registros/modelo";

export const ENTIDADES_DOCUMENTALES = ["donaciones", "entregas", "convenios"] as const;
export type EntidadDocumental = typeof ENTIDADES_DOCUMENTALES[number];
export const MAX_ARCHIVO = 10 * 1024 * 1024;
export const MAX_ARCHIVOS = 20;
export const VALIDACION_ARCHIVO = "bab-contenido-v1";
const version = z.number().int().min(0);
const base = { claveOperacion: z.string().uuid(), versionDatos: version };
const motivo = z.string().trim().min(1, "Explica el motivo.").max(2000);
export const cargaSchema = z.object({ ...base, entidad: z.enum(ENTIDADES_DOCUMENTALES), entidadId: idSchema,
  descripcion: z.string().trim().max(500).default(""), loteId: idSchema.optional()
}).strict().refine(d => !d.loteId || d.entidad === "donaciones", "Solo una foto de recepción puede indicar un lote.");
export const envioSchema = z.object(base).strict();
export const retiroSchema = z.object({ ...base, motivo }).strict();
export const reaperturaSchema = retiroSchema;
export const revisionSchema = z.object({ ...base, decision: z.enum(["aprobar", "observar"]),
  observacion: z.string().trim().max(2000).optional(), confirmacion: z.literal(true, "Confirma que revisaste los datos y evidencias.")
}).strict().refine(d => d.decision !== "observar" || !!d.observacion, "Indica qué debe corregirse.");
export const corregirDonacionSchema = z.object({ ...base, motivo, observaciones: z.string().trim().max(3000) }).strict();
export const corregirEntregaSchema = z.object({ ...base, motivo, observaciones: z.string().trim().max(3000),
  lugar: z.string().trim().min(1).max(300), recibidoPor: z.string().trim().min(1).max(160),
  beneficiariosAtendidos: z.number().int().min(0).max(1000000)
}).strict();

export interface ArchivoVista {
  id: string; nombre: string; tipo: "foto" | "pdf"; mime: string; bytes: number; fecha: string;
  descripcion: string; loteId: string | null; subidoPor: string; estado: string; verificado: boolean;
}
export interface DocumentacionVista {
  entidad: EntidadDocumental; id: string; estado: string; versionDatos: number;
  archivos: ArchivoVista[]; retirados: ArchivoVista[]; referenciasNoDisponibles: number;
  pendientes: string[]; puedeSubir: boolean; puedeRetirar: boolean; puedeEnviar: boolean;
  puedeRevisar: boolean; puedeReabrir: boolean; puedeCorregir: boolean;
}
