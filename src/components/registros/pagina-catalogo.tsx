import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirUsuario } from "@/lib/auth/http";
import { listarCatalogo } from "@/lib/registros/consultas";
import { ErrorRegistro, type Catalogo } from "@/lib/registros/modelo";
import { AppFrame } from "../app-frame";
import type { ParametrosPagina } from "../operaciones/lista";
import { CatalogoInteractivo } from "./catalogo";

export async function PaginaCatalogo({ tipo, searchParams }: { tipo: Catalogo; searchParams: ParametrosPagina }) {
  const usuario = await exigirUsuario();
  if (tipo === "usuarios" && usuario.rol !== "administrador") notFound();
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const valor of Array.isArray(v) ? v : v === undefined ? [] : [v]) params.append(k, valor);
  let error = "";
  let resultado = null;
  try { resultado = await listarCatalogo(usuario, tipo, params); }
  catch (e) { if (e instanceof ErrorRegistro) error = e.message; else throw e; }
  return <AppFrame usuario={usuario} pagina={tipo === "usuarios" ? "usuarios" : "catalogos"}>
    <div className="page-heading"><div><span className="eyebrow text-red">{tipo === "usuarios" ? "ADMINISTRACIÓN" : "REGISTROS COMPARTIDOS"}</span>
      <h1>{tipo === "usuarios" ? "Equipo y accesos" : "Catálogos"}</h1><p>{tipo === "usuarios" ? "Gestiona las cuentas y las responsabilidades de tu equipo." : "Los contactos y acuerdos que acompañan cada operación."}</p></div></div>
    {tipo !== "usuarios" && <nav className="catalogo-tabs" aria-label="Catálogos"><Link aria-current={tipo === "donantes" ? "page" : undefined} href="/catalogos/donantes">Donantes</Link>
      <Link aria-current={tipo === "organizaciones" ? "page" : undefined} href="/catalogos/organizaciones">Organizaciones</Link>
      <Link aria-current={tipo === "convenios" ? "page" : undefined} href="/catalogos/convenios">Convenios</Link></nav>}
    {error && <p className="form-error" role="alert">{error} <Link href={tipo === "usuarios" ? "/usuarios" : `/catalogos/${tipo}`}>Restablecer filtros</Link></p>}
    {resultado && <CatalogoInteractivo tipo={tipo} usuario={usuario} resultado={resultado} q={params.get("q") || ""} activo={params.get("activo") || ""} />}
  </AppFrame>;
}
