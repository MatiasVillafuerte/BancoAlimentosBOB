import Link from "next/link";
import { Brand } from "./brand";
import { LogoutButton } from "./logout-button";
import type { UsuarioPublico } from "@/lib/auth/types";

export const rolVisible = { administrador: "Administración", coordinador: "Coordinación", voluntario: "Voluntariado" };
const paginas = { panel: "Resumen", donaciones: "Donaciones", inventario: "Inventario", entregas: "Entregas", alertas: "Pendientes", catalogos: "Catálogos", usuarios: "Equipo", cuenta: "Mi cuenta" };
const iconos = { panel: "▦", donaciones: "↓", inventario: "▣", entregas: "↑", alertas: "!", catalogos: "▤", usuarios: "♧", cuenta: "○" };
export function AppFrame({ usuario, pagina, children }: { usuario: UsuarioPublico; pagina: keyof typeof paginas; children: React.ReactNode }) {
  return <div className="app-layout">
    <a className="skip-link" href="#contenido">Ir al contenido</a>
    <aside className="sidebar"><Brand /><div className="workspace-label">ESPACIO DE TRABAJO</div>
      <nav aria-label="Navegación principal">{(Object.keys(paginas) as (keyof typeof paginas)[]).filter(key => key !== "usuarios" || usuario.rol === "administrador").map(key =>
        <Link key={key} href={`/${key}`} aria-current={pagina === key ? "page" : undefined}><span aria-hidden="true">{iconos[key]}</span> {paginas[key]}</Link>)}</nav>
      <div className="sidebar-footer"><span className="status-dot" /> Sistema de donaciones<p>Prototipo académico</p></div>
    </aside>
    <div className="app-main"><header className="topbar"><span>Cochabamba <span className="topbar-divider">/</span> {paginas[pagina]}</span>
      <div className="user-area"><div className="avatar" aria-hidden="true">{usuario.nombre.slice(0, 1).toUpperCase()}</div>
        <div><strong>{usuario.nombre}</strong><small>{rolVisible[usuario.rol]}</small></div><LogoutButton /></div>
    </header><main id="contenido" className="page-content">{children}</main></div>
  </div>;
}
