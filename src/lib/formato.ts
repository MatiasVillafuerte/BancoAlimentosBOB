export function fechaVisible(fecha: string | null, hora = false) {
  if (!fecha) return "Sin registro";
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", ...(hora ? { timeStyle: "short" as const } : {}), timeZone: "America/La_Paz" }).format(new Date(fecha));
}
