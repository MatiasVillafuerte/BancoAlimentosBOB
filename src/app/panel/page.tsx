import Link from "next/link";
import { exigirUsuario } from "@/lib/auth/http";
import { consultarPanel } from "@/lib/panel";
import { AppFrame } from "@/components/app-frame";
export const metadata = { title: "Resumen" };
export const dynamic = "force-dynamic";

export default async function Panel() {
  const usuario = await exigirUsuario();
  const resumen = await consultarPanel(usuario);
  return <AppFrame usuario={usuario} pagina="panel">
    <div className="page-heading"><div><span className="eyebrow text-red">{usuario.rol === "administrador" ? "VISTA ADMINISTRATIVA" : "MIS REGISTROS"}</span>
      <h1>Resumen de operaciones</h1><p>El estado de las donaciones y entregas, en un solo lugar.</p></div>
      <span className="live-label"><span className="status-dot" /> Datos de la base actual</span>
    </div>
    <div className="metrics-grid">
      <Link href="/donaciones" className="metric metric-link"><span>Donaciones registradas</span><strong>{resumen.donaciones}</strong><p>Recepciones de alimentos y productos</p></Link>
      <Link href="/entregas" className="metric metric-link"><span>Entregas registradas</span><strong>{resumen.entregas}</strong><p>Programadas y realizadas</p></Link>
      <Link href="/alertas?grupo=por_documentar" className="metric metric-warm metric-link"><span>Falta documentación</span><strong>{resumen.porDocumentar}</strong><p>Operaciones por documentar</p></Link>
    </div>
    <section className="panel-card" aria-labelledby="documentacion-title"><div className="section-title"><h2 id="documentacion-title">Seguimiento documental</h2><span className="tag">Estado actual</span></div>
      <p>Una operación se completa cuando administración valida su información y sus evidencias.</p>
      <Link href="/alertas?grupo=por_documentar" className="status-row status-link"><span className="state-icon amber" aria-hidden="true">!</span><div><strong>Por documentar</strong><p>Faltan fotografías o datos del registro.</p></div><span className="status-count">{resumen.porDocumentar}</span><span aria-hidden="true">→</span></Link>
      <Link href="/alertas?grupo=por_revisar" className="status-row status-link"><span className="state-icon blue" aria-hidden="true">⌕</span><div><strong>Pendientes de revisión</strong><p>La documentación está lista para su validación administrativa.</p></div><span className="status-count">{resumen.porRevisar}</span><span aria-hidden="true">→</span></Link>
      <Link href="/alertas?grupo=observada" className="status-row status-link"><span className="state-icon rose" aria-hidden="true">↩</span><div><strong>Con observaciones</strong><p>Requieren corregir la información indicada por administración.</p></div><span className="status-count">{resumen.observadas}</span><span aria-hidden="true">→</span></Link>
    </section>
    <div className="account-reminder"><div><strong>Tu cuenta, siempre actualizada</strong><p>Consulta tus datos de acceso y cambia tu contraseña cuando lo necesites.</p></div><Link className="button button-secondary" href="/cuenta">Ir a mi cuenta <span aria-hidden="true">→</span></Link></div>
  </AppFrame>;
}
