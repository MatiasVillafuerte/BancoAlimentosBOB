"use client";
import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import type { FichaCatalogo } from "@/lib/registros/modelo";

export function Campo({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return <label className="registro-campo"><span>{label}{props.required && <span aria-hidden="true"> *</span>}</span>
    <input {...props} />{hint && <small>{hint}</small>}</label>;
}
export function Area({ label, name, defaultValue, required = false, maxLength = 3000 }: {
  label: string; name: string; defaultValue?: string; required?: boolean; maxLength?: number
}) {
  return <label className="registro-campo registro-ancho"><span>{label}{required && " *"}</span>
    <textarea name={name} rows={4} defaultValue={defaultValue} required={required} maxLength={maxLength} /></label>;
}
export function SelectorDonante(props: { valor: string; onChange: (valor: string) => void; nombreInicial?: string }) {
  return <SelectorContraparte {...props} tipo="donantes" />;
}
export function SelectorContraparte({ valor, onChange, nombreInicial, tipo }: { valor: string; onChange: (valor: string) => void; nombreInicial?: string; tipo: "donantes" | "organizaciones" }) {
  const etiqueta = tipo === "donantes" ? "Donante" : "Organización";
  const [q, setQ] = useState("");
  const [pagina, setPagina] = useState(1);
  const [resultado, setResultado] = useState<{ registros: FichaCatalogo[]; total: number; paginas: number }>({ registros: [], total: 0, paginas: 0 });
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [seleccion, setSeleccion] = useState({ id: valor, nombre: nombreInicial || "Registro seleccionado" });
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setCargando(true); setError("");
      try {
        const res = await fetch(`/api/${tipo}?activo=si&q=${encodeURIComponent(q)}&pagina=${pagina}`, { signal: abort.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No pudimos consultar el catálogo.");
        setResultado(data);
      } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "No pudimos cargar el catálogo."); }
      finally { if (!abort.signal.aborted) setCargando(false); }
    }, 200);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [q, pagina, tipo]);
  return <div className="selector-donante registro-ancho">
    <div className="registro-grid"><Campo label={`Buscar ${etiqueta.toLowerCase()}`} type="search" value={q} maxLength={80}
      placeholder="Escribe parte del nombre" onChange={e => { setQ(e.target.value); setPagina(1); }} />
      <label className="registro-campo"><span>{etiqueta} *</span><select required value={valor} onChange={e => {
        const id = e.target.value; setSeleccion({ id, nombre: resultado.registros.find(r => r.id === id)?.nombre || "" }); onChange(id);
      }}><option value="">Selecciona un registro activo</option>
        {valor && !resultado.registros.some(r => r.id === valor) && <option value={valor}>{seleccion.id === valor ? seleccion.nombre : nombreInicial || "Registro seleccionado"}</option>}
        {resultado.registros.map(d => <option key={d.id} value={d.id}>{d.nombre} · {d.tipo}</option>)}
      </select></label></div>
    <div className="selector-paginas"><small role="status">{cargando ? "Buscando…" : `${resultado.total} registros activos · página ${pagina}`}</small>
      <button type="button" disabled={pagina <= 1 || cargando} onClick={() => setPagina(p => p - 1)}>Anterior</button>
      <button type="button" disabled={pagina >= resultado.paginas || cargando} onClick={() => setPagina(p => p + 1)}>Siguiente</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
export const dato = (f: FormData, key: string) => String(f.get(key) || "").trim();
export const opcional = (f: FormData, key: string) => dato(f, key) || undefined;

export function useGuardar() {
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState("");
  const clave = useRef<string | null>(null);
  const bloqueado = useRef(false);
  const reintento = useRef<{ url: string; method: string; body: string } | null>(null);
  const [incierto, setIncierto] = useState(false);
  async function guardar(url: string, datos: object, editar = false, claveEnEdicion = false) {
    if (bloqueado.current) return null;
    bloqueado.current = true; setPendiente(true); setError("");
    clave.current ??= crypto.randomUUID();
    const envio = reintento.current || { url, method: editar ? "PATCH" : "POST", body: JSON.stringify({ ...datos, ...(editar && !claveEnEdicion ? {} : { claveOperacion: clave.current }) }) };
    try {
      const res = await fetch(envio.url, { method: envio.method, headers: { "Content-Type": "application/json" }, body: envio.body });
      const data = await res.json();
      if (!res.ok) {
        // Un 503 puede ocurrir después de confirmar la transacción: conservar el envío exacto.
        if (res.status >= 500) { reintento.current = envio; setIncierto(true); }
        else { reintento.current = null; setIncierto(false); }
        setError(data.error || "No pudimos guardar los datos."); return null;
      }
      reintento.current = null; setIncierto(false); return data as { id: string; codigo?: string; repetida?: boolean };
    } catch {
      reintento.current = envio; setIncierto(true);
      setError("No se recibió la confirmación. Reintenta el mismo envío para comprobar el resultado sin duplicarlo."); return null;
    } finally { bloqueado.current = false; setPendiente(false); }
  }
  return { guardar, pendiente, error, incierto };
}
