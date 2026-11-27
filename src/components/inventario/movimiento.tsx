"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Area, Campo, dato, useGuardar } from "../registros/campos";
import { ETIQUETAS_MOVIMIENTO, type DetalleLote } from "@/lib/inventario/modelo";
import type { Rol } from "@/lib/auth/types";

export function FormularioMovimiento({ detalle, rol }: { detalle: DetalleLote; rol: Rol }) {
  const router = useRouter();
  const { guardar, pendiente, error, incierto } = useGuardar();
  const [tipo, setTipo] = useState("merma");
  const [origenId, setOrigen] = useState("");
  const [exito, setExito] = useState(false);
  const origenes = detalle.movimientos.filter(m => tipo === "devolucionEntrada" ? m.tipo === "entrega" : tipo === "devolucionSalida" ? m.tipo === "recepcion" : ["recepcion", "entrega", "merma"].includes(m.tipo));
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const reducciones = detalle.reservas.map(r => ({ entregaId: r.entregaId, versionDatos: r.versionDatos, cantidad: Number(dato(f, `reducir-${r.entregaId}`)) })).filter(r => r.cantidad > 0);
    const res = await guardar("/api/movimientos", { loteId: detalle.lote.id, tipo, cantidad: Number(dato(f, "cantidad")), motivo: dato(f, "motivo"),
      origenId: tipo === "merma" ? undefined : origenId, reducciones,
      ...(tipo === "devolucionEntrada" ? { reincorporar: f.get("reincorporar") === "on" } : {}) });
    if (res) { setExito(true); router.refresh(); }
  }
  if (exito) return <p className="registro-exito" role="status">Movimiento guardado y saldos actualizados. <button type="button" className="record-link" onClick={() => window.location.reload()}>Registrar otra operación</button></p>;
  return <section className="panel-card recepcion-seccion"><h2>Registrar movimiento</h2><p className="record-note">Cada movimiento modifica el saldo físico y conserva el motivo y tu cuenta como responsable.</p>
    <form onSubmit={enviar} aria-busy={pendiente}><fieldset className="registro-fieldset" disabled={pendiente || incierto}><div className="registro-grid">
      <label className="registro-campo"><span>Tipo de movimiento *</span><select value={tipo} onChange={e => { setTipo(e.target.value); setOrigen(""); }}>
        {["merma", "devolucionEntrada", "devolucionSalida", ...(rol === "administrador" ? ["ajusteEntrada", "ajusteSalida"] : [])].map(t => <option value={t} key={t}>{ETIQUETAS_MOVIMIENTO[t]}</option>)}</select></label>
      <Campo label={`Cantidad (${detalle.lote.unidad})`} name="cantidad" type="number" required min={0.001} step={0.001} max={1000000} />
      {tipo !== "merma" && <label className="registro-campo registro-ancho"><span>Movimiento original de este lote *</span><select value={origenId} onChange={e => setOrigen(e.target.value)} required>
        <option value="">Selecciona el origen</option>{origenes.map(m => <option key={m.id} value={m.id}>{ETIQUETAS_MOVIMIENTO[m.tipo]} · {m.cantidad} {m.unidad} · {new Date(m.fecha).toLocaleDateString("es-BO", { timeZone: "America/La_Paz" })} · {m.id.slice(-8)}</option>)}</select>
        <small>Se muestran los movimientos de esta página del historial. Cambia de página si el original es anterior.</small></label>}
      {tipo.startsWith("ajuste") && <p className="registro-ancho registro-ayuda">La entrada suma existencias; la salida las resta. El original se conserva y el historial muestra su cantidad corregida. Esta acción corresponde a administración.</p>}
      {tipo === "devolucionEntrada" && <label className="registro-check registro-ancho"><input name="reincorporar" type="checkbox" />
        Verifiqué las condiciones de los productos y son aptos para volver al inventario. Si no marcas esta opción, se registran la devolución y su merma sin aumentar el saldo disponible.</label>}
      <Area label="Motivo" name="motivo" required maxLength={1000} />
    </div>
    {["merma", "devolucionSalida", "ajusteSalida"].includes(tipo) && detalle.reservas.length > 0 && <details className="reducciones-reserva"><summary>Reducir reservas si la salida afecta cantidades comprometidas</summary>
      <p className="record-note">Elige cuánto liberar de cada entrega. Se conservará la cantidad prevista y la entrega requerirá reasignación antes de confirmarse.</p>
      {detalle.reservas.map(r => <Campo key={r.entregaId} label={`${r.codigo} · ${r.organizacion}`} name={`reducir-${r.entregaId}`} type="number" min={0} max={r.cantidad} step={0.001} defaultValue={0}
        hint={`Reserva actual: ${r.cantidad} ${detalle.lote.unidad}. Cantidad a liberar.`} />)}
    </details>}
    <label className="registro-check"><input type="checkbox" required />Confirmo que el movimiento ocurrió y revisé su efecto sobre las existencias.</label></fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}{incierto && <p role="status">Se conserva el envío original; el reintento no repetirá el movimiento.</p>}
    <div className="registro-acciones"><span>Los movimientos no se borran ni aprueban expedientes.</span><button type="submit" className="button" disabled={pendiente}>{pendiente ? "Guardando…" : incierto ? "Reintentar movimiento" : "Registrar movimiento"}</button></div>
    </form></section>;
}
