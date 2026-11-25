import Link from "next/link";
import { Brand } from "./brand";
import { LogoutButton } from "./logout-button";
import type { UsuarioPublico } from "@/lib/auth/types";

export const rolVisible = { administrador: "Administración", coordinador: "Coordinación", voluntario: "Voluntariado" };
export function AppFrame({ usuario, pagina, children }: { usuario: UsuarioPublico; pagina: "panel" | "cuenta"; children: React.ReactNode }) {
  return <div className="app-layout">
    <a className="skip-link" href="#contenido">Ir al contenido</a>
    <aside className="sidebar"><Brand /><div className="workspace-label">ESPACIO DE TRABAJO</div>
      <nav aria-label="Navegación principal"><Link href="/panel" aria-current={pagina === "panel" ? "page" : undefined}><span aria-hidden="true">▦</span> Resumen</Link>
        <Link href="/cuenta" aria-current={pagina === "cuenta" ? "page" : undefined}><span aria-hidden="true">○</span> Mi cuenta</Link></nav>
      <div className="sidebar-footer"><span className="status-dot" /> Sistema de donaciones<p>Prototipo académico</p></div>
    </aside>
    <div className="app-main"><header className="topbar"><span>Cochabamba <span className="topbar-divider">/</span> {pagina === "panel" ? "Resumen" : "Mi cuenta"}</span>
      <div className="user-area"><div className="avatar" aria-hidden="true">{usuario.nombre.slice(0, 1).toUpperCase()}</div>
        <div><strong>{usuario.nombre}</strong><small>{rolVisible[usuario.rol]}</small></div><LogoutButton /></div>
    </header><main id="contenido" className="page-content">{children}</main></div>
  </div>;
}
