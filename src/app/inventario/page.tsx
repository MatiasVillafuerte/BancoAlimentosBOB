import Link from "next/link";
import { exigirUsuario } from "@/lib/auth/http";
import { consultasInventario } from "@/lib/inventario/http";
import { leerFiltrosInventario } from "@/lib/inventario/modelo";
import { ErrorRegistro, puedeGestionar } from "@/lib/registros/modelo";
import { ZONAS } from "@/lib/operaciones/modelo";
import { AppFrame } from "@/components/app-frame";
import { cantidadVisible, fechaVisible } from "@/components/operaciones/presentacion";
import type { ParametrosPagina } from "@/components/operaciones/lista";
export const dynamic = "force-dynamic";
export const metadata = { title: "Inventario" };
export default async function Inventario({ searchParams }: { searchParams: ParametrosPagina }) {
  const usuario = await exigirUsuario(), entrada = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(entrada)) for (const valor of Array.isArray(v) ? v : v === undefined ? [] : [v]) params.append(k, valor);
  const modo = params.get("modo") || "todos"; params.delete("modo");
  let error = "", filtros = { q: "", zona: "", estado: "", fecha: "", pagina: 1 }, resultado = null;
  try {
    if (!["todos", "fefo"].includes(modo) || Array.isArray(entrada.modo)) throw new ErrorRegistro("Modo de consulta no válido.");
    filtros = leerFiltrosInventario(params, modo === "fefo"); resultado = await (await consultasInventario()).listar(params, modo === "fefo");
  } catch (e) { if (e instanceof ErrorRegistro) error = e.message; else throw e; }
  const url = (pagina: number) => `/inventario?${new URLSearchParams({ ...Object.fromEntries(params), modo, pagina: String(pagina) })}`;
  return <AppFrame usuario={usuario} pagina="inventario"><div className="page-heading"><div><span className="eyebrow text-red">CONTROL DE EXISTENCIAS</span>
    <h1>Inventario y vencimientos</h1><p>Consulta dónde están los productos y cuánto queda disponible para una entrega.</p></div>
    {puedeGestionar(usuario.rol) && <Link className="button" href="/entregas/nueva">Programar entrega ＋</Link>}</div>
    <nav className="catalogo-tabs" aria-label="Consulta de inventario"><Link href="/inventario" aria-current={modo === "todos" ? "page" : undefined}>Todos los lotes</Link>
      <Link href="/inventario?modo=fefo" aria-current={modo === "fefo" ? "page" : undefined}>Sugerencias FEFO</Link></nav>
    <div className="operation-notice blue"><strong>{modo === "fefo" ? "Primero vence, primero sale" : "Físico, reservado y libre"}</strong>
      <p>{modo === "fefo" ? "Se muestran lotes aptos con saldo libre, ordenados por vencimiento. Los que no tienen fecha registrada aparecen al final. Las sugerencias no reservan productos; debes programar una entrega." :
        "La cantidad libre es el saldo físico menos las reservas. Los vencidos y descartados permanecen visibles, pero no se ofrecen para nuevas entregas."}</p></div>
    {error && <p className="form-error" role="alert">{error} <Link href="/inventario">Restablecer filtros</Link></p>}
    <section className="panel-card operation-list"><form action="/inventario" className="operation-filters inventario-filtros">
      <input type="hidden" name="modo" value={modo} />
      <div><label htmlFor="producto">Producto, código o marca</label><input id="producto" name="q" type="search" maxLength={80} defaultValue={filtros.q} /></div>
      <div><label htmlFor="zona">Zona</label><select id="zona" name="zona" defaultValue={filtros.zona}><option value="">Las cuatro zonas</option>{Object.entries(ZONAS).map(([z, nombre]) => <option key={z} value={z}>{nombre}</option>)}</select></div>
      {modo !== "fefo" && <div><label htmlFor="estado-lote">Estado</label><select id="estado-lote" name="estado" defaultValue={filtros.estado}>
        <option value="">Todos</option><option value="disponible">Disponible</option><option value="proximo">Vence en 7 días</option><option value="vencido">Vencido</option><option value="agotado">Agotado</option><option value="descartado">Descartado</option></select></div>}
      {modo === "fefo" && <div><label htmlFor="fecha-fefo">Entrega prevista (Bolivia)</label><input id="fecha-fefo" type="datetime-local" name="fecha" defaultValue={filtros.fecha} /></div>}
      <button className="button" type="submit">Filtrar</button></form>
      {resultado && <><div className="list-summary"><strong>{resultado.total} lotes</strong><span>Las cantidades conservan su unidad</span></div>
        {resultado.registros.length ? <div className="table-scroll" role="region" aria-label="Lotes del inventario" tabIndex={0}><table className="operations-table"><thead><tr>
          <th scope="col">Lote / producto</th><th scope="col">En bodega</th><th scope="col">Reservado</th><th scope="col">Libre</th><th scope="col">Ubicación</th><th scope="col">Vencimiento</th><th scope="col">Estado</th><th scope="col">Información</th>
        </tr></thead><tbody>{resultado.registros.map(l => <tr key={l.id}><td><strong>{l.producto}</strong><small>{l.codigo}</small></td>
          <td>{cantidadVisible(l.enBodega, l.unidad)}</td><td>{cantidadVisible(l.reservada, l.unidad)}</td><td>{cantidadVisible(l.libre, l.unidad)}</td>
          <td>{ZONAS[l.zona]}<small>{l.conservacion}</small></td><td>{l.vencimiento ? fechaVisible(l.vencimiento) : "Sin fecha registrada"}{l.proximoAVencer && <small className="text-red">Vence en 7 días</small>}</td>
          <td><span className={`operation-badge ${l.estado === "disponible" ? "green" : l.estado === "vencido" ? "rose" : "amber"}`}>{l.estado}</span></td>
          <td><Link className="record-link" href={`/inventario/${l.id}`}>Ver lote →</Link></td></tr>)}</tbody></table></div> : <div className="operation-empty"><h2>No hay lotes con estos filtros</h2><p>Revisa la fecha prevista, la zona o el nombre del producto.</p></div>}
        {resultado.paginas > 0 && <nav className="operation-pagination" aria-label="Páginas del inventario"><span>Página {resultado.pagina} de {resultado.paginas}</span><div>
          {resultado.pagina > 1 && <Link href={url(resultado.pagina - 1)}>← Anterior</Link>}{resultado.pagina < resultado.paginas && <Link href={url(resultado.pagina + 1)}>Siguiente →</Link>}</div></nav>}
      </>}
    </section></AppFrame>;
}
