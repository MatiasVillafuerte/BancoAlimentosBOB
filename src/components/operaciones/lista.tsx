import Link from "next/link";
import { exigirUsuario } from "@/lib/auth/http";
import { listarOperaciones } from "@/lib/operaciones/consultas";
import { ErrorConsulta, leerFiltros, ETIQUETAS, ESTADOS, GRUPOS, type TipoConsulta, type FiltrosConsulta } from "@/lib/operaciones/modelo";
import { AppFrame } from "@/components/app-frame";
import { puedeGestionar } from "@/lib/registros/modelo";
import { EstadoOperacion, fechaVisible } from "./presentacion";

export type ParametrosPagina = Promise<Record<string, string | string[] | undefined>>;
const titulos = { donaciones: "Donaciones", entregas: "Entregas", alertas: "Pendientes documentales" };
const descripciones = {
  donaciones: "Consulta las recepciones, sus lotes y el respaldo de cada aporte.",
  entregas: "Revisa lo programado, lo entregado y quién estuvo a cargo.",
  alertas: "Abre cada expediente para conocer lo que falta y a su responsable."
};
function enlacePagina(tipo: TipoConsulta, filtros: FiltrosConsulta, pagina: number) {
  const q = new URLSearchParams();
  if (filtros.q) q.set("q", filtros.q);
  if (filtros.estado) q.set("estado", filtros.estado);
  if (filtros.grupo) q.set("grupo", filtros.grupo);
  if (pagina !== 1) q.set("pagina", String(pagina));
  return `/${tipo}${q.size ? "?" + q : ""}`;
}
export async function ListaOperaciones({ tipo, searchParams }: { tipo: TipoConsulta; searchParams: ParametrosPagina }) {
  const usuario = await exigirUsuario();
  const params = new URLSearchParams();
  for (const [key, valor] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(valor) ? valor : valor === undefined ? [] : [valor]) params.append(key, v);
  }
  let filtros: FiltrosConsulta = { q: "", estado: "", grupo: "", pagina: 1 };
  let error: string | null = null;
  try { filtros = leerFiltros(params, tipo); }
  catch (e) { if (e instanceof ErrorConsulta) error = e.message; else throw e; }
  const resultado = error ? null : await listarOperaciones(usuario, tipo, filtros);
  const estados = tipo === "alertas" ? GRUPOS : ESTADOS[tipo];
  const alcance = usuario.rol === "administrador" ? "Todos los responsables" : tipo === "donaciones" ? "Registrados por tu cuenta" :
    tipo === "entregas" ? puedeGestionar(usuario.rol) ? "Entregas de todo el equipo" : "Entregas propias, asignadas o realizadas por ti" :
      puedeGestionar(usuario.rol) ? "Tus recepciones y las entregas del equipo" : "Tus recepciones y las entregas en las que participas";
  return <AppFrame usuario={usuario} pagina={tipo}>
    <div className="page-heading"><div><span className="eyebrow text-red">CONSULTA DE OPERACIONES</span>
      <h1>{titulos[tipo]}</h1><p>{descripciones[tipo]}</p></div>
      {tipo === "donaciones" ? <Link className="button" href="/donaciones/nueva">Registrar recepción <span aria-hidden="true">＋</span></Link> :
        tipo === "entregas" && puedeGestionar(usuario.rol) ? <Link className="button" href="/entregas/nueva">Programar entrega <span aria-hidden="true">＋</span></Link> :
        <span className="live-label"><span className="status-dot" /> Datos de la base actual</span>}
    </div>
    {error && <div className="operation-notice rose" role="alert">{error} <Link href={`/${tipo}`}>Restablecer filtros</Link></div>}
    <section className="panel-card operation-list" aria-label={titulos[tipo]}>
      <form action={`/${tipo}`} method="get" className="operation-filters">
        <div><label htmlFor="buscar-operacion">Buscar por código o {tipo === "donaciones" ? "donante" : tipo === "entregas" ? "organización" : "donante u organización"}</label>
          <input id="buscar-operacion" type="search" name="q" maxLength={80} defaultValue={filtros.q} placeholder={tipo === "entregas" ? "Ej.: ENT-2026-0023" : "Ej.: DON-2026-0015"} /></div>
        <div><label htmlFor="estado-operacion">{tipo === "alertas" ? "Pendiente" : "Estado"}</label>
          <select id="estado-operacion" name={tipo === "alertas" ? "grupo" : "estado"} defaultValue={tipo === "alertas" ? filtros.grupo : filtros.estado}>
            <option value="">Todos</option>{estados.map(e => <option key={e} value={e}>{ETIQUETAS[e]}</option>)}
          </select></div>
        <button type="submit" className="button">Buscar</button><Link className="clear-filters" href={`/${tipo}`}>Limpiar</Link>
      </form>
      {resultado && <><div className="list-summary"><strong>{resultado.total} {resultado.total === 1 ? "registro" : "registros"}</strong>
        <span>{alcance}</span></div>
        {resultado.registros.length ? <div className="table-scroll" role="region" aria-label="Resultados de operaciones" tabIndex={0}><table className="operations-table">
          <thead><tr><th scope="col">Operación / fecha</th><th scope="col">{tipo === "donaciones" ? "Donante" : tipo === "entregas" ? "Organización" : "Donante / organización"}</th>
            <th scope="col">Estado</th><th scope="col">Registrada por</th><th scope="col"><span className="sr-only">Información</span></th></tr></thead>
          <tbody>{resultado.registros.map(r => <tr key={`${r.tipo}-${r.id}`}>
            <td><strong>{r.codigo}</strong><small>{r.tipo === "donaciones" ? "Recepción" : "Entrega"} · {fechaVisible(r.fecha)}</small></td>
            <td>{r.contraparte}</td><td><EstadoOperacion estado={r.estado} />{r.requiereReasignacion && <small className="text-red">Requiere reasignación</small>}{r.atrasada && <small>Fecha prevista superada</small>}</td>
            <td>{r.autor?.nombre || (r.autorReferenciado ? "Cuenta no disponible" : "Autor no confirmado")}</td>
            <td><Link className="record-link" href={`/${r.tipo}/${r.id}`} aria-label={`Ver ${r.codigo}`}>Información <span aria-hidden="true">→</span></Link></td>
          </tr>)}</tbody>
        </table></div> : <div className="operation-empty"><h2>{resultado.total ? "Esta página no tiene registros" : "No hay registros con estos filtros"}</h2>
          <p>{resultado.total ? "Vuelve a la primera página para consultar los resultados." : "Prueba con otro código o estado. Solo se muestran operaciones disponibles para tu cuenta."}</p>
          <Link className="button button-secondary" href={resultado.total ? enlacePagina(tipo, filtros, 1) : `/${tipo}`}>{resultado.total ? "Ir a la primera página" : "Ver todos"}</Link>
        </div>}
        {resultado.paginas > 0 && <nav className="operation-pagination" aria-label="Páginas de resultados">
          <span>Página {resultado.pagina} · {resultado.paginas} {resultado.paginas === 1 ? "disponible" : "disponibles"}</span>
          <div>{resultado.pagina > 1 && <Link href={enlacePagina(tipo, filtros, resultado.pagina - 1)}>← Anterior</Link>}
            {resultado.pagina < resultado.paginas && <Link href={enlacePagina(tipo, filtros, resultado.pagina + 1)}>Siguiente →</Link>}</div>
        </nav>}
      </>}
    </section>
  </AppFrame>;
}
