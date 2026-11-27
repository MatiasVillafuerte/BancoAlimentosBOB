"use client";
import Link from "next/link";
import { useState } from "react";
import type { UsuarioPublico } from "@/lib/auth/types";
import { puedeGestionar, type Catalogo, type FichaCatalogo } from "@/lib/registros/modelo";
import { EditorCatalogo } from "./editor-catalogo";
import { rolVisible } from "../app-frame";

export function CatalogoInteractivo({ tipo, usuario, resultado, q, activo }: {
  tipo: Catalogo; usuario: UsuarioPublico; q: string; activo: string;
  resultado: { registros: FichaCatalogo[]; total: number; pagina: number; paginas: number }
}) {
  const [editor, setEditor] = useState<{ ficha?: FichaCatalogo; nuevaVersion?: boolean } | null>(null);
  const [mensaje, setMensaje] = useState("");
  const gestionar = tipo === "usuarios" ? usuario.rol === "administrador" : puedeGestionar(usuario.rol);
  const crear = gestionar || tipo === "donantes";
  const ruta = tipo === "usuarios" ? "/usuarios" : `/catalogos/${tipo}`;
  const titulo = { donantes: "Nuevo donante", organizaciones: "Nueva organización", convenios: "Nuevo convenio", usuarios: "Nueva cuenta" }[tipo];
  const paginaUrl = (pagina: number) => `${ruta}?${new URLSearchParams({ q, activo, pagina: String(pagina) })}`;
  return <>
    <div className="catalogo-herramientas"><p>{tipo === "usuarios" ? "El acceso requiere una cuenta activa y una contraseña establecida." :
      tipo === "convenios" ? "Consulta las condiciones pactadas y conserva cada versión del acuerdo." : "Busca antes de registrar para evitar duplicados."}</p>
      {crear && <button className="button" type="button" onClick={() => { setEditor({}); setMensaje(""); }}>{titulo} ＋</button>}</div>
    {mensaje && <p className="registro-exito" role="status">{mensaje}</p>}
    {editor && <EditorCatalogo key={`${tipo}-${editor.ficha?.id || "nuevo"}-${editor.nuevaVersion || false}`}
      tipo={tipo} usuario={usuario} ficha={editor.ficha} nuevaVersion={editor.nuevaVersion}
      soloLectura={!!editor.ficha && !editor.nuevaVersion && (tipo === "convenios" || !gestionar)}
      cerrar={() => setEditor(null)} guardado={texto => { setMensaje(texto); setEditor(null); }} />}
    <section className="panel-card operation-list" aria-label={`Lista de ${tipo}`}>
      <form action={ruta} method="get" className="operation-filters">
        <div><label htmlFor="buscar-catalogo">Buscar por {tipo === "convenios" ? "código o nombre" : tipo === "usuarios" ? "nombre o correo" : "nombre"}</label>
          <input id="buscar-catalogo" name="q" type="search" maxLength={80} defaultValue={q} /></div>
        {tipo !== "convenios" && <div><label htmlFor="activo-catalogo">Disponibilidad</label><select id="activo-catalogo" name="activo" defaultValue={activo}>
          <option value="">Todos</option><option value="si">Activos</option><option value="no">Inactivos</option></select></div>}
        <button className="button" type="submit">Buscar</button><Link className="clear-filters" href={ruta}>Limpiar</Link>
      </form>
      <div className="list-summary"><strong>{resultado.total} registros</strong><span>{tipo === "convenios" ? "Versiones conservadas" : "Catálogo compartido"}</span></div>
      {resultado.registros.length ? <div className="table-scroll" role="region" aria-label={`Resultados de ${tipo}`} tabIndex={0}>
        <table className="operations-table"><thead><tr><th scope="col">{tipo === "convenios" ? "Convenio / donante" : "Nombre"}</th>
          <th scope="col">{tipo === "usuarios" ? "Rol / acceso" : tipo === "convenios" ? "Vigencia" : "Contacto"}</th>
          <th scope="col">Estado</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody>{resultado.registros.map(r => <tr key={r.id}>
            <td><strong>{r.nombre}</strong><small>{tipo === "convenios" ? `${r.codigo} · v${r.version}` : tipo === "usuarios" ? r.email : r.tipo}</small>
              {tipo === "convenios" && <small>{r.donanteNombre}</small>}</td>
            <td>{tipo === "usuarios" ? <>{r.rol && rolVisible[r.rol]}<small>{r.tieneAcceso ? "Contraseña establecida" : "Sin contraseña"}</small></> :
              tipo === "convenios" ? <>{r.desde || "Sin fecha"}<small>Hasta {r.hasta || "sin fecha definida"}</small></> :
              <>{r.contacto?.nombre || r.responsable?.nombre || "Sin contacto"}<small>{r.contacto?.telefono || r.responsable?.telefono || r.contacto?.email || ""}</small></>}</td>
            <td>{tipo === "convenios" ? <span className="badge">{r.tienePdf ? "PDF vinculado" : "PDF pendiente"}</span> :
              <span className={`badge ${r.activo ? "green" : ""}`}>{r.activo ? "Activo" : "Inactivo"}</span>}</td>
            <td><div className="catalogo-acciones"><button className="record-link" type="button" onClick={() => { setEditor({ ficha: r }); setMensaje(""); }}>
              {gestionar && tipo !== "convenios" ? "Editar" : "Ver información"}</button>
              {gestionar && tipo === "convenios" && <button className="record-link" type="button" onClick={() => { setEditor({ ficha: r, nuevaVersion: true }); setMensaje(""); }}>Nueva versión</button>}</div></td>
          </tr>)}</tbody></table></div> : <div className="operation-empty"><h2>No hay registros con estos filtros</h2><p>Prueba con otro nombre o registra una nueva entrada.</p></div>}
      {resultado.paginas > 0 && <nav className="operation-pagination" aria-label="Páginas del catálogo"><span>Página {resultado.pagina} de {resultado.paginas}</span>
        <div>{resultado.pagina > 1 && <Link href={paginaUrl(resultado.pagina - 1)}>← Anterior</Link>}
          {resultado.pagina < resultado.paginas && <Link href={paginaUrl(resultado.pagina + 1)}>Siguiente →</Link>}</div></nav>}
    </section>
  </>;
}
