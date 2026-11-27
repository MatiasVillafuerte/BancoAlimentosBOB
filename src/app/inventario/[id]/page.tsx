import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirUsuario } from "@/lib/auth/http";
import { consultasInventario } from "@/lib/inventario/http";
import { ETIQUETAS_MOVIMIENTO, SIGNOS_MOVIMIENTO } from "@/lib/inventario/modelo";
import { puedeGestionar } from "@/lib/registros/modelo";
import { ZONAS } from "@/lib/operaciones/modelo";
import { AppFrame } from "@/components/app-frame";
import { cantidadVisible, fechaVisible, Dato } from "@/components/operaciones/presentacion";
import { FormularioMovimiento } from "@/components/inventario/movimiento";
import type { ParametrosPagina } from "@/components/operaciones/lista";
export const dynamic = "force-dynamic";
export const metadata = { title: "Información del lote" };
export default async function Lote({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ParametrosPagina }) {
  const usuario = await exigirUsuario(), { id } = await params, filtros = await searchParams;
  const pagina = typeof filtros.pagina === "string" && /^[1-9]\d{0,2}$/.test(filtros.pagina) ? Number(filtros.pagina) : 1;
  const d = await (await consultasInventario()).detalle(usuario, id, pagina);
  if (!d) notFound();
  const l = d.lote;
  return <AppFrame usuario={usuario} pagina="inventario"><Link className="back-link" href="/inventario">← Volver al inventario</Link>
    <div className="page-heading"><div><span className="eyebrow text-red">{l.codigo}</span><h1>{l.producto}</h1><p>{ZONAS[l.zona]} · {l.conservacion} · {l.estado}</p></div>
      {d.puedeVerDonacion && <Link className="button button-secondary" href={`/donaciones/${l.donacionId}`}>Ver recepción</Link>}</div>
    <div className="metrics-grid"><div className="metric"><span>En bodega</span><strong>{cantidadVisible(l.enBodega)}</strong><p>{l.unidad}</p></div>
      <div className="metric"><span>Reservado</span><strong>{cantidadVisible(l.reservada)}</strong><p>{l.unidad}</p></div>
      <div className="metric metric-warm"><span>Libre</span><strong>{cantidadVisible(l.libre)}</strong><p>{l.unidad} · {l.estado === "disponible" ? "revisar vigencia para la entrega" : "no apto para reservar"}</p></div></div>
    {!d.conciliado && <div className="operation-notice rose" role="alert"><strong>Requiere conciliación</strong><p>El saldo físico o reservado no coincide con su historial. Administración debe revisar los movimientos y reservas antes de operar.</p></div>}
    <section className="panel-card recepcion-seccion"><h2>Datos del lote</h2><dl className="record-data record-data-columns">
      <Dato nombre="Cantidad recibida original">{cantidadVisible(l.cantidadRecibida, l.unidad)}</Dato><Dato nombre="Vencimiento">{fechaVisible(l.vencimiento)}</Dato>
      <Dato nombre="Categoría">{l.categoria}</Dato><Dato nombre="Peso recibido medido">{cantidadVisible(l.pesoKg, "kg")}</Dato>
      <Dato nombre="Saldo según movimientos">{cantidadVisible(d.saldoMovimientos, l.unidad)}</Dato><Dato nombre="Conciliación">{d.conciliado ? "Saldo y reservas coinciden" : "Revisar diferencias"}</Dato>
      {Object.entries(l.atributos).map(([k, v]) => <Dato nombre={k} key={k}>{v}</Dato>)}</dl></section>
    <section className="panel-card recepcion-seccion"><h2>Reservas activas</h2><p className="record-note">{usuario.rol === "voluntario" ? "Se muestran las entregas propias o asignadas a tu cuenta. El total reservado incluye todo el equipo." : "Se muestran hasta 100 entregas con reserva activa para este lote."}</p>
      {d.reservas.length ? <div className="table-scroll"><table className="operations-table"><thead><tr><th>Entrega</th><th>Destino</th><th>Fecha prevista</th><th>Previsto</th><th>Reservado</th></tr></thead><tbody>
        {d.reservas.map(r => <tr key={r.entregaId}><td><Link className="record-link" href={`/entregas/${r.entregaId}`}>{r.codigo}</Link></td><td>{r.organizacion}</td><td>{fechaVisible(r.fechaProgramada, true)}</td>
          <td>{cantidadVisible(r.programada, l.unidad)}</td><td>{cantidadVisible(r.cantidad, l.unidad)}</td></tr>)}</tbody></table></div> : <p>No hay reservas visibles para tu cuenta.</p>}</section>
    <section className="panel-card recepcion-seccion"><h2>Historial de movimientos</h2><p className="record-note">Las reservas no son movimientos físicos. Las correcciones conservan el valor original.</p>
      <div className="table-scroll" role="region" aria-label="Movimientos del lote" tabIndex={0}><table className="operations-table"><thead><tr><th>Fecha / tipo</th><th>Cantidad original</th><th>Correcciones / devoluciones</th><th>Motivo / responsable</th><th>Referencia</th></tr></thead><tbody>
        {d.movimientos.map(m => <tr key={m.id}><td><strong>{ETIQUETAS_MOVIMIENTO[m.tipo]}</strong><small>{fechaVisible(m.fecha, true)}</small><small>Ref. {m.id.slice(-8)}</small></td>
          <td>{SIGNOS_MOVIMIENTO[m.tipo] > 0 ? "+" : "−"}{cantidadVisible(m.cantidad, m.unidad)}</td><td>
            {m.ajusteNeto ? <>Corregida: {cantidadVisible(m.cantidadEfectiva, m.unidad)}<small>Efecto en stock: {m.ajusteNeto > 0 ? "+" : ""}{cantidadVisible(m.ajusteNeto, m.unidad)}</small></> : "Sin correcciones"}
            {m.devuelto > 0 && <small>Devuelto: {cantidadVisible(m.devuelto, m.unidad)}</small>}</td><td>{m.motivo}<small>{m.responsable?.nombre || "Responsable no disponible"}</small></td>
          <td>{m.origenId && <small>Origen: {m.origenId.slice(-8)}</small>}{m.entregaId && <Link className="record-link" href={`/entregas/${m.entregaId}`}>Ver entrega</Link>}</td></tr>)}</tbody></table></div>
      {d.paginas > 0 && <nav className="operation-pagination" aria-label="Páginas de movimientos"><span>Página {d.pagina} de {d.paginas}</span><div>
        {d.pagina > 1 && <Link href={`/inventario/${id}?pagina=${d.pagina - 1}`}>← Anterior</Link>}{d.pagina < d.paginas && <Link href={`/inventario/${id}?pagina=${d.pagina + 1}`}>Siguiente →</Link>}</div></nav>}
    </section>
    {puedeGestionar(usuario.rol) && <FormularioMovimiento key={`${pagina}-${d.totalMovimientos}-${l.enBodega}-${l.reservada}`} detalle={d} rol={usuario.rol} />}
  </AppFrame>;
}
