"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Area, Campo, SelectorDonante, dato, opcional, useGuardar } from "./campos";
import { CATEGORIAS, ZONAS_RECEPCION, type FichaCatalogo } from "@/lib/registros/modelo";

function SelectorConvenio({ donanteId, valor, onChange, fecha }: { donanteId: string; valor: string; onChange: (v: string) => void; fecha: string }) {
  const [resultado, setResultado] = useState<{ registros: FichaCatalogo[]; paginas: number; total: number }>({ registros: [], paginas: 0, total: 0 });
  const [pagina, setPagina] = useState(1);
  const [seleccion, setSeleccion] = useState<FichaCatalogo | undefined>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!donanteId) return;
    const abort = new AbortController();
    async function cargar() {
      try {
        const res = await fetch(`/api/convenios?donanteId=${donanteId}&pagina=${pagina}`, { signal: abort.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No pudimos consultar los convenios.");
        setResultado(data); setError("");
      } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "No pudimos consultar los convenios."); }
    }
    void cargar(); return () => abort.abort();
  }, [donanteId, pagina]);
  const opciones = seleccion && valor === seleccion.id && !resultado.registros.some(r => r.id === valor) ? [seleccion, ...resultado.registros] : resultado.registros;
  const dia = fecha.slice(0, 10);
  const vigente = (c: FichaCatalogo) => !!c.desde && c.desde <= dia && (!c.hasta || c.hasta >= dia);
  return <div className="registro-ancho"><label className="registro-campo"><span>Convenio (opcional)</span>
    <select value={valor} disabled={!donanteId} onChange={e => { onChange(e.target.value); setSeleccion(opciones.find(c => c.id === e.target.value)); }}>
      <option value="">Sin convenio / donación ocasional</option>
      {opciones.map(c => <option key={c.id} value={c.id} disabled={!vigente(c)}>{c.codigo} · v{c.version} · {c.nombre}{!vigente(c) ? " (fuera de vigencia)" : ""}</option>)}
    </select><small>Solo son aplicables las versiones del donante vigentes en la fecha de recepción.</small></label>
    {donanteId && <div className="selector-paginas"><small>{resultado.total} versiones · página {pagina}</small>
      <button type="button" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>Anterior</button>
      <button type="button" disabled={pagina >= resultado.paginas} onClick={() => setPagina(p => p + 1)}>Siguiente</button></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}

export function FormularioRecepcion({ ahora, autor }: { ahora: string; autor: string }) {
  const router = useRouter();
  const [donanteId, setDonante] = useState("");
  const [convenioId, setConvenio] = useState("");
  const [fecha, setFecha] = useState(ahora);
  const [lotes, setLotes] = useState([1]);
  const siguiente = useRef(2);
  const { guardar, pendiente, error, incierto } = useGuardar();
  const [guardada, setGuardada] = useState(false);
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (guardada) return;
    const f = new FormData(e.currentTarget);
    const datos = { donanteId, convenioId: convenioId || undefined, fechaRecepcion: fecha, observaciones: opcional(f, "observaciones"),
      lotes: lotes.map(id => ({ producto: dato(f, `producto-${id}`), categoria: dato(f, `categoria-${id}`),
        cantidad: Number(dato(f, `cantidad-${id}`)), unidad: dato(f, `unidad-${id}`), zona: dato(f, `zona-${id}`),
        conservacion: dato(f, `conservacion-${id}`), fechaVencimiento: opcional(f, `fechaVencimiento-${id}`),
        pesoKg: opcional(f, `pesoKg-${id}`) ? Number(dato(f, `pesoKg-${id}`)) : undefined,
        marca: opcional(f, `marca-${id}`), codigoLote: opcional(f, `codigoLote-${id}`) })) };
    const res = await guardar("/api/donaciones", datos);
    if (res) { setGuardada(true); router.push(`/donaciones/${res.id}`); router.refresh(); }
  }
  return <form onSubmit={enviar} aria-busy={pendiente || guardada}>
    <fieldset className="registro-fieldset" disabled={pendiente || incierto || guardada}>
      <section className="panel-card recepcion-seccion"><div className="registro-paso"><span>1</span><div><h2>Origen de la donación</h2><p>Identifica quién dona y cuándo llegaron los productos.</p></div></div>
        <div className="registro-grid"><SelectorDonante valor={donanteId} onChange={id => { setDonante(id); setConvenio(""); }} />
          <p className="registro-ancho registro-enlace">¿No está registrado? <Link href="/catalogos/donantes" target="_blank" rel="noopener">Registrar donante en otra pestaña ↗</Link></p>
          <Campo label="Fecha y hora de recepción (Bolivia)" type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)} required />
          <div className="registro-autor"><span>Registrada por</span><strong>{autor}</strong><small>Se asocia automáticamente con tu cuenta.</small></div>
          <SelectorConvenio key={donanteId} donanteId={donanteId} valor={convenioId} onChange={setConvenio} fecha={fecha} />
        </div>
      </section>
      <section className="panel-card recepcion-seccion"><div className="registro-paso"><span>2</span><div><h2>Productos recibidos</h2><p>Separa los productos por lote, vencimiento y condiciones de conservación.</p></div></div>
        {lotes.map((id, i) => <fieldset className="lote-editor" key={id}><legend>Lote {i + 1}</legend>
          <div className="registro-grid">
            <Campo label="Producto" name={`producto-${id}`} required maxLength={160} placeholder="Ej.: arroz de 1 kg" />
            <label className="registro-campo"><span>Categoría *</span><select name={`categoria-${id}`} defaultValue="no perecedero" required>{CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
            <Campo label="Cantidad recibida" name={`cantidad-${id}`} type="number" min={0.001} max={1000000} step={0.001} required placeholder="Ej.: 100" />
            <Campo label="Unidad" name={`unidad-${id}`} required maxLength={40} placeholder="Ej.: bolsa, caja, kg" hint="Se mantendrá esta unidad en todo el recorrido del lote." />
            <label className="registro-campo"><span>Zona de almacenamiento *</span><select name={`zona-${id}`} defaultValue="Z1" required>{Object.entries(ZONAS_RECEPCION).map(([z, nombre]) => <option key={z} value={z}>{z} · {nombre}</option>)}</select></label>
            <label className="registro-campo"><span>Conservación *</span><select name={`conservacion-${id}`} defaultValue="ambiente" required><option value="ambiente">Ambiente</option><option value="refrigerado">Refrigerado</option></select></label>
            <Campo label="Fecha de vencimiento (si consta)" name={`fechaVencimiento-${id}`} type="date" hint="Si ya venció, se registrará como vencido y no estará disponible para repartir." />
            <Campo label="Peso total del lote en kg (opcional)" name={`pesoKg-${id}`} type="number" min={0.001} max={1000000} step={0.001} hint="Peso medido de todo el lote; no es el peso de cada unidad." />
            <Campo label="Marca (opcional)" name={`marca-${id}`} maxLength={100} />
            <Campo label="Código de lote del fabricante (opcional)" name={`codigoLote-${id}`} maxLength={100} />
          </div>
          {lotes.length > 1 && <button className="record-link quitar-lote" type="button" onClick={() => setLotes(ls => ls.filter(l => l !== id))}>Quitar lote {i + 1}</button>}
        </fieldset>)}
        <button className="button button-secondary" type="button" disabled={lotes.length >= 30} onClick={() => { const id = siguiente.current++; setLotes(ls => [...ls, id]); }}>＋ Añadir otro lote</button>
        <p className="registro-ayuda">Hasta 30 lotes por recepción. Las cantidades se registran por unidad; el peso total solo se calcula si todos los lotes tienen peso medido.</p>
      </section>
      <section className="panel-card recepcion-seccion"><div className="registro-paso"><span>3</span><div><h2>Confirmar recepción</h2><p>Revisa los datos antes de incorporar estos alimentos al inventario.</p></div></div>
        <Area label="Observaciones (opcional)" name="observaciones" />
        <div className="operation-notice"><strong>Estado inicial: por documentar</strong><p>Los lotes ingresan al inventario al guardar. Administración verá el expediente pendiente; las fotografías y su revisión se habilitarán en la etapa de evidencias.</p></div>
        <label className="registro-check"><input type="checkbox" required />Confirmo que estos productos ya fueron recibidos y que revisé cantidades, unidades y ubicación.</label>
      </section>
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    {incierto && <p role="status">Se conserva el envío original. El reintento comprobará la misma recepción sin duplicar sus lotes.</p>}
    <div className="registro-acciones recepcion-acciones"><Link href="/donaciones" className="clear-filters">Volver a donaciones</Link>
      <button className="button" type="submit" disabled={pendiente || guardada}>{guardada ? "Recepción guardada…" : pendiente ? "Registrando…" : incierto ? "Reintentar recepción" : "Confirmar y registrar recepción"}</button></div>
  </form>;
}
