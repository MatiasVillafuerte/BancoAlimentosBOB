import Link from "next/link";
import { notFound } from "next/navigation";
import { AppFrame } from "@/components/app-frame";
import { Dato } from "@/components/operaciones/presentacion";
import { PanelArchivos } from "@/components/documentos/expediente";
import { exigirUsuario } from "@/lib/auth/http";
import { obtenerCatalogo } from "@/lib/registros/consultas";
import { servicioDocumentos } from "@/lib/documentos/consultas";

export const metadata = { title: "Convenio y documentación" };
export const dynamic = "force-dynamic";
export default async function Convenio({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await exigirUsuario(), { id } = await params;
  const f = await obtenerCatalogo(usuario, "convenios", id);
  if (!f) notFound();
  const documentos = await (await servicioDocumentos()).detalle(usuario, "convenios", id);
  return <AppFrame usuario={usuario} pagina="catalogos">
    <Link className="back-link" href="/catalogos/convenios">← Volver a convenios</Link>
    <div className="page-heading"><div><span className="eyebrow text-red">ACUERDO CON EL DONANTE</span><h1>{f.codigo} · versión {f.version}</h1><p>{f.nombre}</p></div></div>
    <section className="panel-card record-card"><h2>Condiciones registradas</h2><dl className="record-data record-data-columns">
      <Dato nombre="Donante">{f.donanteNombre}</Dato><Dato nombre="Vigencia">{f.desde} → {f.hasta || "Sin fecha final registrada"}</Dato>
      <Dato nombre="Periodicidad pactada">{f.periodicidad || "No especificada"}</Dato>
    </dl><p className="preserve-lines">{f.condiciones}</p></section>
    <section className="panel-card record-card documento-seccion"><h2>Documento contractual</h2>
      <PanelArchivos key={documentos.versionDatos} documento={documentos} />
    </section>
  </AppFrame>;
}
