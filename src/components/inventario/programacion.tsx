"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Area, Campo, dato, SelectorContraparte, useGuardar } from "../registros/campos";
import { ZONAS_RECEPCION } from "@/lib/registros/modelo";
import type { FichaOperacion } from "@/lib/operaciones/modelo";
import type { ListadoInventario } from "@/lib/inventario/modelo";

type Linea = { id: string; producto: string; codigo: string; unidad: string; cantidad: number; libre: number; reservaPropia: number };
function SelectorLotes({ fecha, seleccionados, agregar }: { fecha: string; seleccionados: string[]; agregar: (l: Linea) => void }) {
  const [q, setQ] = useState(""), [zona, setZona] = useState(""), [pagina, setPagina] = useState(1);
  const [resultado, setResultado] = useState<ListadoInventario>({ registros: [], total: 0, paginas: 0, pagina: 1 });
  const [error, setError] = useState(""), [cargando, setCargando] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setCargando(true); setError("");
      try {
        const params = new URLSearchParams({ q, zona, pagina: String(pagina), ...(fecha ? { fecha } : {}) });
        const res = await fetch(`/api/sugerencias-fefo?${params}`, { signal: abort.signal });
        const d = await res.json(); if (!res.ok) throw new Error(d.error || "No pudimos consultar los lotes."); setResultado(d);
      } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "No pudimos consultar el inventario."); }
      finally { if (!abort.signal.aborted) setCargando(false); }
    }, 200);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [fecha, q, zona, pagina]);
  return <div className="selector-lotes"><div className="registro-grid"><Campo label="Buscar producto o lote" type="search" value={q} maxLength={80} onChange={e => { setQ(e.target.value); setPagina(1); }} />
    <label className="registro-campo"><span>Zona</span><select value={zona} onChange={e => { setZona(e.target.value); setPagina(1); }}><option value="">Las cuatro zonas</option>
      {Object.entries(ZONAS_RECEPCION).map(([z, n]) => <option key={z} value={z}>{z} · {n}</option>)}</select></label></div>
    <p className="record-note">Sugerencias FEFO para la fecha prevista. Añadir a esta lista todavía no reserva productos.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="table-scroll"><table className="operations-table"><thead><tr><th>Producto / lote</th><th>Vencimiento</th><th>Libre</th><th>Seleccionar</th></tr></thead><tbody>
      {resultado.registros.map(l => <tr key={l.id}><td><strong>{l.producto}</strong><small>{l.codigo} · {l.zona}</small></td>
        <td>{l.vencimiento ? new Date(l.vencimiento).toLocaleDateString("es-BO", { timeZone: "America/La_Paz" }) : "Sin fecha registrada"}</td><td>{l.libre} {l.unidad}</td>
        <td><button type="button" className="button button-secondary button-small" disabled={cargando || seleccionados.includes(l.id) || seleccionados.length >= 30}
          onClick={() => agregar({ id: l.id, codigo: l.codigo, producto: l.producto, unidad: l.unidad, cantidad: Math.min(1, l.libre), libre: l.libre, reservaPropia: 0 })}>{seleccionados.includes(l.id) ? "Añadido" : "Añadir"}</button></td></tr>)}</tbody></table></div>
    {!resultado.registros.length && <p className="record-note">No hay lotes aptos con saldo libre para estos filtros.</p>}
    <div className="selector-paginas"><small role="status">{cargando ? "Consultando…" : `${resultado.total} lotes · página ${pagina}`}</small>
      <button type="button" disabled={pagina <= 1 || cargando} onClick={() => setPagina(p => p - 1)}>Anterior</button><button type="button" disabled={pagina >= resultado.paginas || cargando} onClick={() => setPagina(p => p + 1)}>Siguiente</button></div>
  </div>;
}

export function FormularioProgramacion({ ahora, responsables, usuarioId, ficha }: {
  ahora: string; responsables: { id: string; nombre: string; rol: string }[]; usuarioId: string; ficha?: FichaOperacion
}) {
  const router = useRouter(), { guardar, pendiente, error, incierto } = useGuardar();
  const [fecha, setFecha] = useState(ficha?.fechaProgramada ? new Date(new Date(ficha.fechaProgramada).getTime() - 4 * 3600000).toISOString().slice(0, 16) : ahora);
  const [organizacion, setOrganizacion] = useState(ficha?.contraparte?.id || "");
  const [lineas, setLineas] = useState<Linea[]>(() => (ficha?.lineasEntrega || []).map(i => ({ id: i.loteId!, producto: i.lote?.producto || "Lote no disponible",
    codigo: i.lote?.codigo || "", unidad: i.unidad || "", cantidad: i.programada ?? i.reservada ?? 0, libre: i.lote?.libre || 0, reservaPropia: i.reservada || 0 })));
  const [guardada, setGuardada] = useState(false);
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const res = await guardar(`/api/entregas${ficha ? "/" + ficha.id : ""}`, { organizacionId: organizacion, fechaProgramada: fecha,
      responsablePrevistoId: dato(f, "responsable"), lugar: dato(f, "lugar"), beneficiariosPrevistos: Number(dato(f, "beneficiarios")), observaciones: dato(f, "observaciones"),
      items: lineas.map(i => ({ loteId: i.id, cantidad: i.cantidad })), ...(ficha ? { versionDatos: ficha.versionDatos, motivo: dato(f, "motivo") } : {}) }, !!ficha, true);
    if (res) { setGuardada(true); router.push(`/entregas/${res.id}`); router.refresh(); }
  }
  return <form onSubmit={enviar} aria-busy={pendiente || guardada}><fieldset className="registro-fieldset" disabled={pendiente || incierto || guardada}>
    <section className="panel-card recepcion-seccion"><h2>Destino y responsable</h2><div className="registro-grid">
      <SelectorContraparte tipo="organizaciones" valor={organizacion} onChange={setOrganizacion} nombreInicial={ficha?.contraparteNombreRegistrado || undefined} />
      <Campo label="Fecha prevista (Bolivia)" type="datetime-local" value={fecha} required onChange={e => setFecha(e.target.value)} />
      <label className="registro-campo"><span>Responsable previsto *</span><select name="responsable" defaultValue={ficha?.responsablePrevisto?.id || usuarioId} required>
        <option value="">Selecciona una cuenta activa</option>{responsables.map(p => <option key={p.id} value={p.id}>{p.nombre} · {p.rol}</option>)}</select></label>
      <Campo label="Lugar de entrega" name="lugar" defaultValue={ficha?.lugar || ""} required maxLength={300} />
      <Campo label="Atenciones previstas" name="beneficiarios" type="number" min={0} max={1000000} step={1} defaultValue={ficha?.beneficiariosPrevistos ?? 0} required />
    </div></section>
    <section className="panel-card recepcion-seccion"><h2>Elegir lotes por FEFO</h2><SelectorLotes key={fecha} fecha={fecha} seleccionados={lineas.map(i => i.id)} agregar={l => setLineas(ls => ls.some(i => i.id === l.id) ? ls : [...ls, l])} /></section>
    <section className="panel-card recepcion-seccion"><h2>Cantidades a reservar</h2>
      {lineas.length ? <div className="table-scroll"><table className="operations-table"><thead><tr><th>Lote</th><th>Libre + reserva propia</th><th>Cantidad</th><th>Acción</th></tr></thead><tbody>
        {lineas.map(l => <tr key={l.id}><td><strong>{l.producto}</strong><small>{l.codigo}</small></td><td>{Math.round((l.libre + l.reservaPropia) * 1000) / 1000} {l.unidad}</td>
          <td><input aria-label={`Cantidad a reservar de ${l.producto}`} className="cantidad-input" type="number" min={0.001} max={1000000} step={0.001} required value={l.cantidad || ""}
            onChange={e => setLineas(ls => ls.map(i => i.id === l.id ? { ...i, cantidad: Number(e.target.value) } : i))} /><small>{l.unidad}</small></td>
          <td><button type="button" className="record-link" onClick={() => setLineas(ls => ls.filter(i => i.id !== l.id))}>Quitar</button></td></tr>)}</tbody></table></div> : <p>Añade al menos un lote desde las sugerencias.</p>}
      <p className="record-note">El saldo se vuelve a comprobar al guardar. Si otra entrega ya reservó esas existencias, la programación se rechazará sin guardar una parte.</p>
      <Area label="Observaciones (opcional)" name="observaciones" defaultValue={ficha?.observaciones || ""} />
      {ficha && <Area label="Motivo del cambio" name="motivo" required maxLength={1000} />}
    </section></fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}{incierto && <p role="status">Se conserva el envío original. Reintenta para conocer el resultado sin duplicar reservas.</p>}
    <div className="registro-acciones"><Link href={ficha ? `/entregas/${ficha.id}` : "/entregas"}>Volver a entregas</Link><button className="button" disabled={pendiente || guardada || !lineas.length} type="submit">
      {guardada ? "Programación guardada…" : pendiente ? "Guardando…" : incierto ? "Reintentar envío" : ficha ? "Actualizar programación" : "Programar y reservar"}</button></div>
  </form>;
}
