"use client";
import { useState } from "react";

export function PasswordField({ id, label, value, onChange, autoComplete, minLength = 1, disabled = false }: {
  id: string; label: string; value: string; onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password"; minLength?: number; disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    <div className="password-wrap">
      <input id={id} name={id} type={visible ? "text" : "password"} required minLength={minLength}
        maxLength={128} autoComplete={autoComplete} value={value} disabled={disabled}
        onChange={e => onChange(e.target.value)} />
      <button className="reveal" type="button" disabled={disabled} aria-controls={id}
        aria-label={(visible ? "Ocultar " : "Mostrar ") + label.toLowerCase()}
        aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? "Ocultar" : "Mostrar"}</button>
    </div>
  </div>;
}
