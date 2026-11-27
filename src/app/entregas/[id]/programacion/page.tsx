import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirUsuario } from "@/lib/auth/http";
import { consultasInventario } from "@/lib/inventario/http";
import { obtenerFicha } from "@/lib/operaciones/consultas";
import { puedeGestionar } from "@/lib/registros/modelo";
import { AppFrame } from "@/components/app-frame";
import { FormularioProgramacion } from "@/components/inventario/programacion";
export const metadata = { title: "Modificar programación" };
export const dynamic = "force-dynamic";
export default async function EditarEntrega({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await exigirUsuario();
  if (!puedeGestionar(usuario.rol)) notFound();
  const { id } = await params, ficha = await obtenerFicha(usuario, "entregas", id);
  if (!ficha) notFound();
  const ahora = new Date(new Date().getTime() - 4 * 3600000).toISOString().slice(0, 16);
  return <AppFrame usuario={usuario} pagina="entregas"><div className="page-heading"><div><span className="eyebrow text-red">{ficha.codigo}</span>
    <h1>Modificar programación</h1><p>El cambio de cantidades recalcula las reservas y conserva su motivo.</p></div></div>
    {ficha.estado === "programada" ? <FormularioProgramacion ahora={ahora} responsables={await (await consultasInventario()).responsables(usuario)} usuarioId={usuario.id} ficha={ficha} /> :
      <div className="operation-notice amber"><p>Esta entrega ya no admite cambios de programación. Consulta su expediente y los movimientos de sus lotes.</p><Link href={`/entregas/${id}`}>Volver a la entrega</Link></div>}
  </AppFrame>;
}
