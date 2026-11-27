import { exigirUsuario } from "@/lib/auth/http";
import { AppFrame } from "@/components/app-frame";
import { FormularioRecepcion } from "@/components/registros/recepcion";
export const metadata = { title: "Registrar recepción" };
export const dynamic = "force-dynamic";
export default async function NuevaRecepcion() {
  const usuario = await exigirUsuario();
  const ahora = new Date(new Date().getTime() - 4 * 3600000).toISOString().slice(0, 16);
  return <AppFrame usuario={usuario} pagina="donaciones"><div className="page-heading"><div><span className="eyebrow text-red">INGRESO AL INVENTARIO</span>
    <h1>Registrar recepción</h1><p>Una donación, sus lotes y el inicio de su trazabilidad.</p></div></div>
    <FormularioRecepcion ahora={ahora} autor={usuario.nombre} /></AppFrame>;
}
