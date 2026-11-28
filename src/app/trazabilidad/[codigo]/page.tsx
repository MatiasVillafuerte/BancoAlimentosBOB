import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirUsuario } from "@/lib/auth/http";
import { consultasInformes } from "@/lib/informes/http";
import { AppFrame } from "@/components/app-frame";
import { cantidadVisible as n, fechaVisible, EstadoOperacion } from "@/components/operaciones/presentacion";
export const dynamic = "force-dynamic";
export const metadata = { title: "Trazabilidad" };
export default async function Trazabilidad({ params }: { params: Promise<{ codigo: string }> }) {
  const u = await exigirUsuario(), r = await (await consultasInformes()).trazabilidad(u, (await params).codigo);
  if (!r) notFound();
  return <AppFrame usuario={u} pagina="entregas"><Link className="back-link" href={`/entregas/${r.id}`}>← Volver al expediente y sus evidencias</Link>
    <div className="page-heading record-heading"><div><span className="eyebrow text-red">DEL ORIGEN A LA ENTREGA</span><h1>Trazabilidad de {r.codigo}</h1>
      <p>{r.organizacion} · {r.fecha ? fechaVisible(r.fecha, true) : "Sin salida física registrada"}</p></div><EstadoOperacion estado={r.estado} /></div>
    <p>Recorre cada lote desde la donación que lo originó. Abre los expedientes para consultar responsables, documentos e historial.</p>
    {r.lineas.map((l, i) => <section className="panel-card record-card documento-seccion" key={l.lote?.id || i}>
      <h2>{l.lote?.producto || "Lote sin registro"}</h2>
      <ol className="traza-pasos">
        <li><strong>1. Donante y convenio</strong>{l.donacion ? <><p>{l.donacion.donante}</p><p>{l.donacion.convenio ? <Link href={`/convenios/${l.donacion.convenio.id}`}>
          {l.donacion.convenio.codigo} · versión {l.donacion.convenio.version}</Link> : l.donacion.convenioPendiente ? "Referencia de convenio no resuelta" : "Sin convenio asociado"}</p></> : <p>El origen no está disponible para esta cuenta o falta en el registro.</p>}</li>
        <li><strong>2. Recepción</strong>{l.donacion ? <><p><Link href={`/donaciones/${l.donacion.id}`}>{l.donacion.codigo}</Link></p>
          <p>{fechaVisible(l.donacion.fecha)}</p><EstadoOperacion estado={l.donacion.estado} /></> : <p>Solicita a administración revisar la recepción de origen.</p>}</li>
        <li><strong>3. Lote en bodega</strong>{l.lote ? <><p><Link href={`/inventario/${l.lote.id}`}>{l.lote.codigo}</Link></p><p>Zona {l.lote.zona}</p>
          <p>Consulta su saldo, reservas y movimientos.</p></> : <p>No se encontró el lote referenciado.</p>}</li>
        <li><strong>4. Distribución</strong><p>Programada: {n(l.programada ?? null, l.unidad)}</p>
          <p>Salida original: {n(l.salidaRegistrada, l.unidad)}</p>{l.cantidades ? <><p>Corregida: {n(l.cantidades.corregida, l.unidad)}</p>
          <p>Devuelta: {n(l.cantidades.devuelta, l.unidad)}</p><p>Neta: {n(l.cantidades.neta, l.unidad)}</p></> : <p>{r.fecha && l.salidaRegistrada !== 0 ? "Movimiento original no disponible." : "Sin movimiento de salida para este lote."}</p>}</li>
      </ol></section>)}
    <p className="record-note">La trazabilidad respeta los permisos de cada expediente. Las cantidades netas incluyen correcciones y devoluciones registradas hasta esta consulta.</p>
  </AppFrame>;
}
