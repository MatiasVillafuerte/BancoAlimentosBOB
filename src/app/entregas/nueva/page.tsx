import { notFound } from "next/navigation";
import { exigirUsuario } from "@/lib/auth/http";
import { consultasInventario } from "@/lib/inventario/http";
import { puedeGestionar } from "@/lib/registros/modelo";
import { AppFrame } from "@/components/app-frame";
import { FormularioProgramacion } from "@/components/inventario/programacion";
export const metadata = { title: "Programar entrega" };
export const dynamic = "force-dynamic";
export default async function NuevaEntrega() {
  const usuario = await exigirUsuario();
  if (!puedeGestionar(usuario.rol)) notFound();
  const responsables = await (await consultasInventario()).responsables(usuario);
  const ahora = new Date(new Date().getTime() - 4 * 3600000).toISOString().slice(0, 16);
  return <AppFrame usuario={usuario} pagina="entregas"><div className="page-heading"><div><span className="eyebrow text-red">PLANIFICACIÓN DE LA DISTRIBUCIÓN</span>
    <h1>Programar entrega</h1><p>Elige el destino y reserva los productos que se entregarán.</p></div></div>
    <FormularioProgramacion ahora={ahora} responsables={responsables} usuarioId={usuario.id} /></AppFrame>;
}
