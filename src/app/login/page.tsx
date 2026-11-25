import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/auth/http";
import { Brand } from "@/components/brand";
import { LoginForm } from "./login-form";
export const metadata = { title: "Inicio de sesión" };

export default async function LoginPage() {
  if (await usuarioActual()) redirect("/panel");
  return <main className="login-layout">
    <section className="login-story" aria-labelledby="story-title">
      <Brand light />
      <div className="story-copy"><span className="eyebrow">DONACIONES CON TRAZABILIDAD</span>
        <h1 id="story-title">Cada donación,<br />con su respaldo.</h1>
        <p>La información que acompaña a los alimentos también importa. Reunimos su recepción, sus lotes y la evidencia de cada entrega.</p>
        <div className="crates" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      </div>
      <div className="story-footer"><span>Recepción</span><span>Inventario</span><span>Entregas</span><span>Documentación</span></div>
    </section>
    <section className="login-access" aria-labelledby="login-title">
      <div className="login-form-container"><span className="eyebrow text-red">ACCESO DEL EQUIPO</span>
        <h2 id="login-title">Bienvenido de nuevo</h2>
        <p className="subtitle">Ingresa con tu cuenta para continuar.</p>
        <LoginForm />
        <div className="access-note"><span className="status-dot" /><p>Acceso exclusivo para el personal autorizado.</p></div>
      </div>
      <p className="academic-note">Prototipo académico · Cochabamba, Bolivia</p>
    </section>
  </main>;
}
