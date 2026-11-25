"use client";
import { useState, type FormEvent } from "react";
import { PasswordField } from "@/components/password-field";

export function PasswordForm() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [pendiente, setPendiente] = useState(false);
  async function cambiar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendiente) return;
    setError(""); setMensaje("");
    if (nueva !== confirmacion) { setError("La nueva contraseña y su confirmación deben coincidir."); return; }
    setPendiente(true);
    try {
      const res = await fetch("/api/cuenta/password", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passwordActual: actual, passwordNueva: nueva, confirmacion }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "No pudimos cambiar la contraseña."); return; }
      setActual(""); setNueva(""); setConfirmacion("");
      setMensaje("Contraseña actualizada. Las sesiones de otros dispositivos se cerraron.");
    } catch { setError("No pudimos conectar con el sistema. Inténtalo nuevamente."); }
    finally { setPendiente(false); }
  }
  return <form className="account-form" onSubmit={cambiar} aria-busy={pendiente}>
    <PasswordField id="passwordActual" label="Contraseña actual" value={actual} onChange={setActual} autoComplete="current-password" disabled={pendiente} />
    <PasswordField id="passwordNueva" label="Nueva contraseña" value={nueva} onChange={setNueva} minLength={15} autoComplete="new-password" disabled={pendiente} />
    <p className="field-hint">Usa entre 15 y 128 caracteres. Puedes utilizar una frase que recuerdes.</p>
    <PasswordField id="confirmacion" label="Confirma la nueva contraseña" value={confirmacion} onChange={setConfirmacion} minLength={15} autoComplete="new-password" disabled={pendiente} />
    {error && <p className="form-error" role="alert">{error}</p>}
    {mensaje && <p className="form-success" role="status">{mensaje}</p>}
    <button className="button" disabled={pendiente} type="submit">{pendiente ? "Guardando…" : "Guardar contraseña"}</button>
  </form>;
}
