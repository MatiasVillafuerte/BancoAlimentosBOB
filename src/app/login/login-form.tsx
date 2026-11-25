"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PasswordField } from "@/components/password-field";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pendiente, setPendiente] = useState(false);
  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendiente) return;
    setPendiente(true); setError("");
    try {
      const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "No pudimos iniciar sesión."); return; }
      setPassword(""); router.replace("/panel"); router.refresh();
    } catch { setError("No pudimos conectar con el sistema. Comprueba tu conexión e inténtalo nuevamente."); }
    finally { setPendiente(false); }
  }
  return <form onSubmit={enviar} aria-busy={pendiente}>
    <div className="field"><label htmlFor="email">Correo electrónico</label>
      <input id="email" name="email" type="email" required maxLength={254} autoComplete="username"
        placeholder="tu.correo@ejemplo.com" value={email} disabled={pendiente}
        onChange={e => setEmail(e.target.value)} />
    </div>
    <PasswordField id="password" label="Contraseña" value={password} onChange={setPassword}
      autoComplete="current-password" disabled={pendiente} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button button-full" type="submit" disabled={pendiente}>
      {pendiente ? "Ingresando…" : "Ingresar al sistema"}<span aria-hidden="true">→</span>
    </button>
    <p className="form-help">Si necesitas una cuenta o recuperar tu acceso, contacta con la administración del banco.</p>
  </form>;
}
