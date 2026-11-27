import { ETIQUETAS } from "@/lib/operaciones/modelo";
import type { PersonaVista } from "@/lib/operaciones/modelo";

export function fechaVisible(fecha: string | null, hora = false) {
  if (!fecha) return "Sin registro";
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", ...(hora ? { timeStyle: "short" as const } : {}), timeZone: "America/La_Paz" }).format(new Date(fecha));
}
export function cantidadVisible(valor: number | null, unidad = "") {
  return valor === null ? "Sin registro" : new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 }).format(valor) + (unidad ? " " + unidad : "");
}
export function EstadoOperacion({ estado }: { estado: string }) {
  const color = estado === "completada" ? "green" : estado === "por_documentar" ? "amber" : estado === "observada" ? "rose" : "blue";
  return <span className={`operation-badge ${color}`}>{ETIQUETAS[estado] || estado}</span>;
}
export function Dato({ nombre, children }: { nombre: string; children: React.ReactNode }) {
  return <div><dt>{nombre}</dt><dd>{children ?? "Sin registro"}</dd></div>;
}
export function DatosPersona({ persona, sinDatos = "Sin registro" }: { persona: PersonaVista; sinDatos?: string }) {
  if (!persona) return <p className="muted-copy">{sinDatos}</p>;
  const roles: Record<string, string> = { administrador: "Administración", coordinador: "Coordinación", voluntario: "Voluntariado" };
  return <dl className="record-data">
    <Dato nombre="Nombre">{persona.nombre}</Dato><Dato nombre="Correo">{persona.email}</Dato>
    <Dato nombre="Teléfono">{persona.telefono}</Dato><Dato nombre="Rol actual">{roles[persona.rol || ""] || persona.rol}</Dato>
    <Dato nombre="Estado de la cuenta">{persona.activo ? "Activa" : "Inactiva"}</Dato>
  </dl>;
}
