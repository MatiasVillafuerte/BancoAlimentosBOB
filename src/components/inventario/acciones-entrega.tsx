"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { FichaOperacion } from "@/lib/operaciones/modelo";
import { Area, Campo, dato, opcional, useGuardar } from "../registros/campos";

function FormularioAccion({ ficha, accion, ahora, cerrar }: { ficha: FichaOperacion; accion: "confirmar" | "cancelar"; ahora: string; cerrar: () => void }) {
  const router = useRouter(), { guardar, pendiente, error, incierto } = useGuardar();
  const [guardada, setGuardada] = useState(false);
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const datos = accion === "cancelar" ? { versionDatos: ficha.versionDatos, motivo: dato(f, "motivo") } : {
      versionDatos: ficha.versionDatos, fechaEntrega: dato(f, "fecha"), recibidoPor: dato(f, "recibidoPor"), lugar: dato(f, "lugar"),
      beneficiariosAtendidos: Number(dato(f, "beneficiarios")), observaciones: dato(f, "observaciones"), items: ficha.lineasEntrega.map(i => ({
        loteId: i.loteId, cantidad: Number(dato(f, `cantidad-${i.loteId}`)), pesoKg: opcional(f, `peso-${i.loteId}`) ? Number(dato(f, `peso-${i.loteId}`)) : undefined }))
    };
    const res = await guardar(`/api/entregas/${ficha.id}/${accion}`, datos);
    if (res) { setGuardada(true); router.refresh(); }
  }
  return <form onSubmit={enviar} aria-busy={pendiente}><fieldset className="registro-fieldset" disabled={pendiente || incierto || guardada}>
    {accion === "cancelar" ? <><h2>Cancelar antes de la salida</h2><p>Se liberarán las reservas. El expediente quedará cancelado y el saldo físico se conservará.</p><Area label="Motivo de cancelación" name="motivo" required maxLength={1000} /></> : <>
      <h2>Confirmar lo realmente entregado</h2><p className="record-note">Puedes entregar una parte. El resto de la reserva se liberará; si queda un compromiso, programa otra entrega.</p>
      <div className="registro-grid"><Campo label="Fecha y hora real (Bolivia)" name="fecha" type="datetime-local" defaultValue={ahora} required />
        <Campo label="Recibido por" name="recibidoPor" required maxLength={160} /><Campo label="Lugar real de entrega" name="lugar" defaultValue={ficha.lugar || ""} required maxLength={300} />
        <Campo label="Atenciones realizadas" name="beneficiarios" type="number" min={0} step={1} max={1000000} required /></div>
      <div className="table-scroll"><table className="operations-table"><thead><tr><th>Producto</th><th>Reservado</th><th>Entregado</th><th>Peso real del total entregado (kg)</th></tr></thead><tbody>
        {ficha.lineasEntrega.map(i => <tr key={i.loteId}><td>{i.lote?.producto}<small>{i.lote?.codigo}</small></td><td>{i.reservada} {i.unidad}</td>
          <td><input className="cantidad-input" aria-label={`Cantidad entregada de ${i.lote?.producto}`} name={`cantidad-${i.loteId}`} type="number" min={0} max={i.reservada || 0} step={0.001} required defaultValue={i.reservada || 0} /></td>
          <td><input className="cantidad-input" aria-label={`Peso entregado de ${i.lote?.producto}`} name={`peso-${i.loteId}`} type="number" min={0.001} max={1000000} step={0.001} placeholder="Opcional" /></td></tr>)}</tbody></table></div>
      <Area label="Observaciones" name="observaciones" defaultValue={ficha.observaciones || ""} />
      <div className="operation-notice amber"><strong>La entrega quedará por documentar</strong><p>La confirmación descuenta los productos una vez. La carga de fotografías y la validación administrativa se incorporan en la etapa de evidencias.</p></div>
      <label className="registro-check"><input type="checkbox" required />Confirmo que la entrega ya ocurrió y revisé las cantidades reales.</label>
    </>}</fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}{incierto && <p role="status">Se reintentará exactamente el mismo envío.</p>}
    <div className="registro-acciones"><button type="button" className="button button-secondary" onClick={cerrar} disabled={pendiente}>Cerrar</button>
      <button type="submit" className="button" disabled={pendiente || guardada}>{guardada ? "Guardado…" : pendiente ? "Guardando…" : incierto ? "Reintentar" : accion === "cancelar" ? "Cancelar entrega y liberar reservas" : "Confirmar salida real"}</button></div>
  </form>;
}
export function AccionesEntrega({ ficha, gestionar, ahora }: { ficha: FichaOperacion; gestionar: boolean; ahora: string }) {
  const [accion, setAccion] = useState<"confirmar" | "cancelar" | null>(null);
  return <section className="panel-card recepcion-seccion"><div className="acciones-entrega">
    {!ficha.requiereReasignacion && <button className="button" type="button" onClick={() => setAccion("confirmar")}>Confirmar entrega</button>}
    {gestionar && <><Link className="button button-secondary" href={`/entregas/${ficha.id}/programacion`}>Modificar programación</Link>
      <button className="button button-secondary" type="button" onClick={() => setAccion("cancelar")}>Cancelar entrega</button></>}
  </div>{ficha.requiereReasignacion && <p className="form-error">Las reservas se redujeron por un movimiento. Coordinación debe reasignar lotes o ajustar las cantidades previstas antes de confirmar.</p>}
    {accion && <FormularioAccion key={accion} ficha={ficha} accion={accion} ahora={ahora} cerrar={() => setAccion(null)} />}
  </section>;
}
