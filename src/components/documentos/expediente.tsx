"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ArchivoVista, DocumentacionVista } from "@/lib/documentos/modelo";
import type { FichaOperacion } from "@/lib/operaciones/modelo";
import { Area, Campo, dato, useGuardar } from "../registros/campos";
import { fechaVisible } from "@/lib/formato";

type Lote = { id: string; codigo: string | null; producto: string | null };
export function PanelArchivos({ documento: d, lotes = [] }: { documento: DocumentacionVista; lotes?: Lote[] }) {
  return <>
    <p className="muted-copy">{d.entidad === "convenios" ? "Cada versión conserva su PDF original. Para cambiar el contrato, crea una nueva versión desde el catálogo." :
      "Adjunta las fotografías y comprobantes de esta operación. Cada archivo conserva quién lo subió y cuándo."}</p>
    {d.archivos.length ? <ul className="documentos-galeria">{d.archivos.map(a => <TarjetaArchivo key={a.id} archivo={a} documento={d} lotes={lotes} />)}</ul> :
      <div className="evidence-empty"><span aria-hidden="true">▧</span><p>{d.entidad === "convenios" ? "El PDF de esta versión está pendiente." : "Todavía no hay evidencias en este expediente."}</p></div>}
    {d.referenciasNoDisponibles > 0 && <p className="form-error">Hay {d.referenciasNoDisponibles} referencias cuyo archivo no está disponible. Administración debe comprobarlas antes de revisar.</p>}
    {d.puedeSubir && <CargarArchivo documento={d} lotes={lotes} />}
    {d.estado === "completada" && <p className="record-note">El expediente está aprobado. Administración debe reabrirlo antes de modificar sus datos o evidencias.</p>}
    {d.retirados.length > 0 && <details className="documentos-retirados"><summary>Evidencias retiradas ({d.retirados.length})</summary>
      <p className="record-note">Se conservan para consultar el historial; no cuentan como evidencia actual.</p>
      <ul className="documentos-galeria">{d.retirados.map(a => <TarjetaArchivo key={a.id} archivo={a} documento={d} lotes={lotes} />)}</ul></details>}
  </>;
}
function TarjetaArchivo({ archivo: a, documento: d, lotes }: { archivo: ArchivoVista; documento: DocumentacionVista; lotes: Lote[] }) {
  const disponible = a.verificado && ["vinculado", "retirado"].includes(a.estado);
  const url = `/api/archivos/${a.id}`;
  return <li className="documento-tarjeta">
    {disponible && a.tipo === "foto" ? <a href={url} target="_blank" rel="noreferrer" aria-label={`Abrir fotografía: ${a.nombre}`}>
      {/* La ruta exige la cookie de sesión; no se envía la evidencia al optimizador de imágenes. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={a.descripcion || a.nombre} loading="lazy" className="documento-foto" /></a> : <div className="documento-icono" aria-hidden="true">{a.tipo === "pdf" ? "PDF" : "▧"}</div>}
    <div className="documento-info"><strong>{a.nombre}</strong><small>{(a.bytes / 1024 / 1024).toLocaleString("es-BO", { maximumFractionDigits: 2 })} MB · {fechaVisible(a.fecha, true)}</small>
      <small>Subido por {a.subidoPor}</small>{a.descripcion && <p className="preserve-lines">{a.descripcion}</p>}
      {a.loteId && <small>Lote: {lotes.find(l => l.id === a.loteId)?.codigo || "Lote de esta recepción"}</small>}
      {disponible ? <div className="documento-enlaces"><a className="record-link" href={url} target="_blank" rel="noreferrer">Abrir {a.tipo === "foto" ? "foto" : "PDF"} ↗</a>
        <a className="record-link" href={`${url}?descargar=1`}>Descargar</a></div> : <p className="form-error">Archivo anterior sin validación de contenido. Incorpora una copia válida para presentarlo a revisión.</p>}
      {d.puedeRetirar && ["vinculado", "legado"].includes(a.estado) && <RetirarArchivo archivo={a} documento={d} />}
    </div>
  </li>;
}
function CargarArchivo({ documento: d, lotes }: { documento: DocumentacionVista; lotes: Lote[] }) {
  const router = useRouter();
  const [pendiente, setPendiente] = useState(false), [error, setError] = useState(""), [incierto, setIncierto] = useState(false), [exito, setExito] = useState(false);
  const envio = useRef<FormData | null>(null), ocupado = useRef(false);
  async function subir(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (ocupado.current || exito) return;
    const f = new FormData(e.currentTarget);
    if (!envio.current) {
      const archivo = f.get("archivo");
      if (!(archivo instanceof File) || !archivo.size || archivo.size > 10 * 1024 * 1024) { setError("Selecciona un archivo de hasta 10 MB."); return; }
      const carga = new FormData();
      carga.set("archivo", archivo);
      carga.set("datos", JSON.stringify({ entidad: d.entidad, entidadId: d.id, versionDatos: d.versionDatos, claveOperacion: crypto.randomUUID(),
        descripcion: dato(f, "descripcion"), ...(dato(f, "loteId") ? { loteId: dato(f, "loteId") } : {}) }));
      envio.current = carga;
    }
    ocupado.current = true; setPendiente(true); setError("");
    try {
      const res = await fetch("/api/archivos", { method: "POST", body: envio.current });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No pudimos incorporar el archivo.");
        if (res.status >= 500) setIncierto(true);
        else { envio.current = null; setIncierto(false); }
        return;
      }
      setExito(true); setIncierto(false); envio.current = null; router.refresh();
    } catch { setIncierto(true); setError("No recibimos la confirmación. Reintenta esta misma carga para consultar su resultado sin duplicarla."); }
    finally { ocupado.current = false; setPendiente(false); }
  }
  return <form onSubmit={subir} className="documento-carga" aria-busy={pendiente}>
    <h3>{d.entidad === "convenios" ? "Incorporar PDF del convenio" : "Añadir una evidencia"}</h3>
    <fieldset className="registro-fieldset" disabled={pendiente || incierto || exito}><div className="registro-grid">
      <Campo label="Archivo" type="file" name="archivo" required accept={d.entidad === "convenios" ? "application/pdf,.pdf" : "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"}
        hint={d.entidad === "convenios" ? "PDF de hasta 10 MB, sin contraseña. Comprueba que corresponda a esta versión." : "JPEG, PNG, WebP o PDF. Hasta 10 MB por archivo y 20 archivos activos por operación."} />
      <Campo label="Descripción (opcional)" name="descripcion" maxLength={500} placeholder="Qué documenta esta evidencia" />
      {d.entidad === "donaciones" && lotes.length > 0 && <label className="registro-campo"><span>Lote fotografiado (opcional)</span><select name="loteId" defaultValue="">
        <option value="">Evidencia general de la recepción</option>{lotes.map(l => <option key={l.id} value={l.id}>{l.codigo} · {l.producto}</option>)}</select><small>Selecciona un lote solo si subes una fotografía suya.</small></label>}
    </div></fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    {exito && <p className="registro-exito" role="status">Archivo incorporado. Actualizando el expediente…</p>}
    <button className="button" disabled={pendiente || exito} type="submit">{pendiente ? "Validando y guardando…" : incierto ? "Reintentar la misma carga" : "Guardar archivo"}</button>
    {d.entidad !== "convenios" && <p className="record-note">Puedes añadir más archivos después de cada carga. Cuando termines, envía el expediente a revisión.</p>}
  </form>;
}
function RetirarArchivo({ archivo: a, documento: d }: { archivo: ArchivoVista; documento: DocumentacionVista }) {
  const { guardar, pendiente, error, incierto } = useGuardar(), router = useRouter();
  const [exito, setExito] = useState(false);
  async function retirar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (await guardar(`/api/archivos/${a.id}/retirar`, { versionDatos: d.versionDatos, motivo: dato(f, "motivo") })) { setExito(true); router.refresh(); }
  }
  return <details className="documento-retiro"><summary>Retirar del expediente actual</summary><form onSubmit={retirar} aria-busy={pendiente}>
    <p>El archivo seguirá en el historial. Si había una revisión pendiente, será necesario enviar el expediente nuevamente.</p>
    <fieldset className="registro-fieldset" disabled={pendiente || incierto || exito}><Campo label="Motivo del retiro" name="motivo" maxLength={2000} required /></fieldset>
    {error && <p role="alert" className="form-error">{error}</p>}<button className="button button-secondary button-small" disabled={pendiente || exito}>{pendiente ? "Guardando…" : incierto ? "Reintentar retiro" : "Confirmar retiro"}</button>
  </form></details>;
}
type Accion = "reenviar" | "revision" | "reabrir" | "documentacion";
const etiquetas: Record<Accion, string> = { reenviar: "Enviar a revisión", revision: "Revisar expediente", reabrir: "Reabrir expediente", documentacion: "Corregir información" };
export function AccionesDocumentales({ documento: d, ficha: f }: { documento: DocumentacionVista; ficha: FichaOperacion }) {
  const disponibles: Accion[] = [];
  if (d.puedeEnviar) disponibles.push("reenviar");
  if (d.puedeRevisar) disponibles.push("revision");
  if (d.puedeReabrir) disponibles.push("reabrir");
  if (d.puedeCorregir) disponibles.push("documentacion");
  const [seleccion, setSeleccion] = useState<Accion | null>(null);
  const [bloqueado, setBloqueado] = useState(false);
  const accion = seleccion && disponibles.includes(seleccion) ? seleccion : disponibles[0];
  return <>
    {d.pendientes.length > 0 && <div className="documentos-pendientes"><strong>Antes de presentar o aprobar</strong><ul>{d.pendientes.map(p => <li key={p}>{p}</li>)}</ul></div>}
    {disponibles.length > 0 ? <><div className="documentos-acciones">{disponibles.map(a => <button key={a} type="button" className={`button ${accion === a ? "" : "button-secondary"}`}
      aria-pressed={accion === a} disabled={bloqueado} onClick={() => setSeleccion(a)}>{etiquetas[a]}</button>)}</div>
      <FormularioAccion key={accion} accion={accion} documento={d} ficha={f} bloquear={setBloqueado} /></> : <p className="muted-copy">{d.estado === "programada" ? "Confirma la entrega real desde sus acciones para poder presentar las evidencias." :
        d.estado === "recibida" || d.estado === "entregada" ? "El expediente está a la espera de la validación de administración." : "No hay acciones documentales disponibles para tu cuenta en este estado."}</p>}
  </>;
}
function FormularioAccion({ accion, documento: d, ficha: f, bloquear }: { accion: Accion; documento: DocumentacionVista; ficha: FichaOperacion; bloquear: (valor: boolean) => void }) {
  const { guardar, pendiente, error, incierto } = useGuardar(), router = useRouter();
  const [decision, setDecision] = useState("aprobar"), [exito, setExito] = useState(false);
  useEffect(() => { bloquear(pendiente || incierto || exito); }, [pendiente, incierto, exito, bloquear]);
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const cuerpo = { versionDatos: d.versionDatos,
      ...(accion === "revision" ? { decision, observacion: dato(datos, "observacion"), confirmacion: datos.get("confirmacion") === "on" } : {}),
      ...(["reabrir", "documentacion"].includes(accion) ? { motivo: dato(datos, "motivo") } : {}),
      ...(accion === "documentacion" ? { observaciones: dato(datos, "observaciones"), ...(d.entidad === "entregas" ? {
        lugar: dato(datos, "lugar"), recibidoPor: dato(datos, "recibidoPor"), beneficiariosAtendidos: Number(dato(datos, "beneficiariosAtendidos")) } : {}) } : {}) };
    if (await guardar(`/api/${d.entidad}/${d.id}/${accion}`, cuerpo, accion === "documentacion", true)) { setExito(true); router.refresh(); }
  }
  const faltantes = d.pendientes.length > 0 && (accion === "reenviar" || (accion === "revision" && decision === "aprobar"));
  return <form onSubmit={enviar} className="documento-accion" aria-busy={pendiente}>
    {accion === "reenviar" && <p>Comprueba los datos y las evidencias. El expediente quedará pendiente de la revisión de administración.</p>}
    {accion === "reabrir" && <p>La aprobación actual quedará en el historial. El expediente volverá a estar por documentar y requerirá otra revisión.</p>}
    {accion === "documentacion" && <p>Corrige la información descriptiva. Las cantidades se corrigen desde los movimientos del lote, conservando el registro original.</p>}
    <fieldset className="registro-fieldset" disabled={pendiente || incierto || exito}><div className="registro-grid">
      {accion === "revision" && <><label className="registro-campo"><span>Resultado de la revisión</span><select value={decision} onChange={e => setDecision(e.target.value)}>
        <option value="aprobar">Aprobar y completar</option><option value="observar">Solicitar correcciones</option></select></label>
        <Area label={decision === "observar" ? "Qué debe corregirse" : "Comentario de revisión (opcional)"} name="observacion" required={decision === "observar"} maxLength={2000} />
        <label className="documento-confirmacion registro-ancho"><input type="checkbox" name="confirmacion" required />He revisado los datos, el responsable, las cantidades y las evidencias de este expediente.</label></>}
      {accion === "documentacion" && <>{d.entidad === "entregas" && <>
        <Campo label="Lugar de entrega" name="lugar" defaultValue={f.lugar || ""} required maxLength={300} />
        <Campo label="Recibido por" name="recibidoPor" defaultValue={f.recibidoPor || ""} required maxLength={160} />
        <Campo label="Atenciones realizadas" name="beneficiariosAtendidos" type="number" min={0} max={1000000} step={1} required defaultValue={f.beneficiariosAtendidos ?? 0} />
      </>}<Area label="Observaciones de la operación" name="observaciones" defaultValue={f.observaciones || ""} /></>}
      {["reabrir", "documentacion"].includes(accion) && <Area label={accion === "reabrir" ? "Motivo de la reapertura" : "Motivo de la corrección"} name="motivo" required maxLength={2000} />}
    </div></fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}{exito && <p className="registro-exito" role="status">Acción registrada. Actualizando el expediente…</p>}
    <button className="button" type="submit" disabled={pendiente || exito || (!incierto && faltantes)}>{pendiente ? "Guardando…" : incierto ? "Reintentar el mismo envío" :
      accion === "revision" ? decision === "aprobar" ? "Aprobar y completar" : "Enviar observaciones" : accion === "documentacion" ? "Guardar corrección" : etiquetas[accion]}</button>
  </form>;
}
