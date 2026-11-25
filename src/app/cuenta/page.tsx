import { exigirUsuario } from "@/lib/auth/http";
import { AppFrame, rolVisible } from "@/components/app-frame";
import { PasswordForm } from "./password-form";
export const metadata = { title: "Mi cuenta" };

export default async function Cuenta() {
  const usuario = await exigirUsuario();
  return <AppFrame usuario={usuario} pagina="cuenta"><div className="page-heading"><div><span className="eyebrow text-red">ACCESO PERSONAL</span><h1>Mi cuenta</h1><p>Tu información de contacto y la seguridad de tu acceso.</p></div></div>
    <div className="account-grid"><section className="panel-card"><h2>Datos de la cuenta</h2><dl className="profile-list">
      <div><dt>Nombre</dt><dd>{usuario.nombre}</dd></div><div><dt>Correo</dt><dd>{usuario.email}</dd></div>
      <div><dt>Teléfono</dt><dd>{usuario.telefono || "Sin registrar"}</dd></div><div><dt>Rol</dt><dd>{rolVisible[usuario.rol]}</dd></div>
      <div><dt>Estado</dt><dd><span className="active-tag">Activa</span></dd></div></dl>
    </section><section className="panel-card"><h2>Cambiar contraseña</h2><p>Al cambiarla, solo quedará abierta esta sesión.</p><PasswordForm /></section></div>
  </AppFrame>;
}
