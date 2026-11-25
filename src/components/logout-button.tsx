"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState("");
  async function salir() {
    setPendiente(true); setError("");
    try {
      const res = await fetch("/api/logout", { method: "POST" });
      if (!res.ok) throw new Error();
      router.replace("/login"); router.refresh();
    } catch { setError("No pudimos cerrar la sesión. Inténtalo nuevamente."); }
    finally { setPendiente(false); }
  }
  return <div><button className="button-quiet" type="button" disabled={pendiente} onClick={salir}>
    {pendiente ? "Cerrando…" : "Cerrar sesión"}</button>
    {error && <p className="form-error" role="alert">{error}</p>}</div>;
}
