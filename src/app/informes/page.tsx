import Link from "next/link";
import { exigirUsuario } from "@/lib/auth/http";
import { consultasInformes } from "@/lib/informes/http";
import { periodoInforme } from "@/lib/informes/modelo";
import { ErrorRegistro } from "@/lib/registros/modelo";
import { AppFrame } from "@/components/app-frame";
import { cantidadVisible as n, fechaVisible } from "@/components/operaciones/presentacion";
import type { ParametrosPagina } from "@/components/operaciones/lista";
export const dynamic = "force-dynamic";
export const metadata = { title: "Informes" };
export default async function Informes({ searchParams }: { searchParams: ParametrosPagina }) {
  const u = await exigirUsuario(), entrada = await searchParams, params = new URLSearchParams();
  for (const [k, v] of Object.entries(entrada)) for (const valor of Array.isArray(v) ? v : v === undefined ? [] : [v]) params.append(k, valor);
  let filtros = periodoInforme(new URLSearchParams()), resultado = null, error = "";
  try { filtros = periodoInforme(params); resultado = await (await consultasInformes()).resumen(u, params); }
  catch (e) { if (e instanceof ErrorRegistro) error = e.message; else throw e; }
  return <AppFrame usuario={u} pagina="informes"><div className="page-heading"><div><span className="eyebrow text-red">ACTIVIDAD Y DOCUMENTACIÓN</span>
    <h1>Informes de operaciones</h1><p>Recepciones y entregas realizadas en el período, con su situación documental actual.</p></div></div>
    <section className="panel-card record-card"><form action="/informes" className="operation-filters informe-filtros">
      <div><label htmlFor="desde">Desde (Bolivia)</label><input id="desde" name="desde" type="date" required defaultValue={filtros.desde} /></div>
      <div><label htmlFor="hasta">Hasta, inclusive</label><input id="hasta" name="hasta" type="date" required defaultValue={filtros.hasta} /></div>
      <button className="button">Consultar informe</button></form>
      {error && <p className="form-error" role="alert">{error} <Link href="/informes">Restablecer fechas</Link></p>}
    </section>
    {resultado && <><div className="operation-notice blue"><strong>Alcance: {resultado.alcance}</strong><p>Se cuentan operaciones físicas por su fecha real; las programaciones no cuentan como entregas.
      La aprobación corresponde al estado actual, no a la fecha en que se revisó. Las correcciones y devoluciones posteriores se incluyen en las cantidades de la operación original.</p>
      <p>Consultado: {fechaVisible(resultado.consultadoEn, true)} · Máximo 366 días y 500 operaciones por sección.</p></div>
      {resultado.secciones.map(s => <section className="panel-card record-card documento-seccion" key={s.tipo}>
        <h2>{s.tipo === "donaciones" ? "Recepciones" : "Entregas realizadas"}</h2>
        <dl className="informe-cifras"><div><dt>Operaciones físicas</dt><dd>{n(s.operaciones)}</dd></div>
          <div><dt>Validadas por administración</dt><dd>{n(s.aprobadas)}</dd></div><div><dt>Sin validación vigente</dt><dd>{n(s.pendientes)}</dd></div></dl>
        <p><strong>Peso original registrado: {n(s.pesoKgRegistrado, "kg")}</strong>. Disponible en {s.operacionesConPeso} de {s.operaciones} operaciones.
          No estima los pesos faltantes ni descuenta kilos de devoluciones o ajustes sin pesaje.</p>
        {s.tipo === "entregas" && <p><strong>Atenciones registradas: {n(s.atenciones)}</strong>. Con información en {s.operacionesConAtenciones} de {s.operaciones} entregas.
          Son participaciones; una persona puede estar incluida en varias entregas.</p>}
        {s.lineasSinMovimiento > 0 && <p className="form-error">Hay {s.lineasSinMovimiento} líneas sin movimiento original. Las cantidades están incompletas; revisa los registros históricos.</p>}
        {!s.operaciones ? <p className="muted-copy">No hay operaciones visibles en este período.</p> : <>
          <div className="table-scroll" role="region" aria-label={`Cantidades de ${s.tipo}`} tabIndex={0}><table className="operations-table"><thead><tr>
            <th>Producto</th><th>Unidad</th><th>Original</th><th>Corregida</th><th>Devuelta</th><th>Neta</th></tr></thead><tbody>
            {s.cantidades.map(c => <tr key={JSON.stringify([c.producto, c.unidad])}><td>{c.producto}</td><td>{c.unidad}</td>
              <td>{n(c.original)}</td><td>{n(c.corregida)}</td><td>{n(c.devuelta)}</td><td><strong>{n(c.neta)}</strong></td></tr>)}</tbody></table></div>
          <p className="record-note">Corregida = original más sus ajustes; neta = corregida menos devoluciones. No es el saldo actual de bodega.
            Se agrupan nombres de producto y unidades iguales. No se convierten tamaños de envase ni se suman unidades diferentes.</p></>}
      </section>)}
      <p><Link className="record-link" href="/entregas">Abrir una entrega y consultar su trazabilidad →</Link></p>
    </>}
  </AppFrame>;
}
