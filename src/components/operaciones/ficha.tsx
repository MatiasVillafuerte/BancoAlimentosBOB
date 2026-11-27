import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirUsuario } from "@/lib/auth/http";
import { obtenerFicha } from "@/lib/operaciones/consultas";
import { ZONAS, type TipoOperacion } from "@/lib/operaciones/modelo";
import { AppFrame } from "@/components/app-frame";
import { Dato, DatosPersona, EstadoOperacion, cantidadVisible, fechaVisible } from "./presentacion";

const mensajes: Record<string, string> = {
  programada: "La entrega tiene cantidades reservadas. Los productos todavía no se han descontado físicamente de bodega.",
  por_documentar: "La operación ya se realizó. Falta completar su documentación; este estado no revierte la recepción ni la salida de productos.",
  recibida: "La recepción está documentada y espera la revisión administrativa.",
  entregada: "La entrega está documentada y espera la revisión administrativa. La salida física ya está registrada.",
  observada: "Administración solicitó una corrección. Revisa la observación y los datos del responsable.",
  completada: "Administración validó la información y las evidencias de esta operación.",
  cancelada: "La entrega se canceló antes de realizarse. Sus reservas quedaron liberadas."
};
function Card({ titulo, children, wide = false }: { titulo: string; children: React.ReactNode; wide?: boolean }) {
  return <section className={`panel-card record-card${wide ? " record-wide" : ""}`}><h2>{titulo}</h2>{children}</section>;
}
export async function FichaDeOperacion({ tipo, id }: { tipo: TipoOperacion; id: string }) {
  const usuario = await exigirUsuario();
  const f = await obtenerFicha(usuario, tipo, id);
  if (!f) notFound();
  const donacion = tipo === "donaciones";
  return <AppFrame usuario={usuario} pagina={tipo}>
    <Link className="back-link" href={`/${tipo}`}>← Volver a {tipo}</Link>
    <div className="page-heading record-heading"><div><span className="eyebrow text-red">{donacion ? "RECEPCIÓN DE DONACIÓN" : "EXPEDIENTE DE ENTREGA"}</span>
      <h1>{f.codigo}</h1><p>{f.contraparteNombreRegistrado || "Contraparte sin registro"}</p></div><EstadoOperacion estado={f.estado} /></div>
    <div className={`operation-notice ${f.estado === "observada" ? "rose" : f.estado === "por_documentar" ? "amber" : "blue"}`}>
      <strong>{f.estado === "observada" ? "Requiere corrección" : "Estado de la operación"}</strong><p>{mensajes[f.estado] || "Consulta los datos registrados de esta operación."}</p>
      {f.estado === "observada" && f.revision.observacion && <p className="preserve-lines">{f.revision.observacion}</p>}
    </div>
    <div className="record-grid">
      <Card titulo="Datos de la operación"><dl className="record-data">
        {donacion ? <Dato nombre="Fecha de recepción">{fechaVisible(f.fechaRecepcion, true)}</Dato> : <>
          <Dato nombre="Fecha programada">{fechaVisible(f.fechaProgramada, true)}</Dato>
          <Dato nombre="Fecha de entrega real">{fechaVisible(f.fechaEntrega, true)}</Dato>
          <Dato nombre="Lugar de entrega">{f.lugar}</Dato><Dato nombre="Recibido por">{f.recibidoPor}</Dato>
          <Dato nombre="Atenciones previstas">{cantidadVisible(f.beneficiariosPrevistos)}</Dato>
          <Dato nombre="Atenciones realizadas">{cantidadVisible(f.beneficiariosAtendidos)}</Dato></>}
        <Dato nombre="Peso total medido">{cantidadVisible(f.pesoTotalKg, "kg")}</Dato>
        <Dato nombre="Registro creado">{fechaVisible(f.registradaEn, true)}</Dato>
        <Dato nombre="Versión de los datos">{cantidadVisible(f.versionDatos)}</Dato>
      </dl>{!donacion && <p className="record-note">Las atenciones cuentan participaciones; no representan personas únicas.</p>}</Card>
      <Card titulo={donacion ? "Donante" : "Organización receptora"}>
        {f.contraparte ? <dl className="record-data">
          <Dato nombre="Nombre actual">{f.contraparte.nombre}</Dato><Dato nombre="Tipo">{f.contraparte.tipo}</Dato>
          <Dato nombre="Dirección">{f.contraparte.direccion}</Dato>{donacion && <Dato nombre="NIT">{f.contraparte.nit}</Dato>}
          <Dato nombre="Persona de contacto">{f.contraparte.contacto.nombre}</Dato>
          <Dato nombre="Función">{f.contraparte.contacto.funcion}</Dato>
          <Dato nombre="Correo">{f.contraparte.contacto.email}</Dato><Dato nombre="Teléfono">{f.contraparte.contacto.telefono}</Dato>
          {f.contraparte.contacto.medio && <Dato nombre="Medio de contacto">{f.contraparte.contacto.medio}</Dato>}
        </dl> : <p className="muted-copy">El registro relacionado no está disponible. Se conserva el nombre que figura en la operación.</p>}
      </Card>
      {donacion && <Card titulo="Convenio asociado" wide>
        {f.convenio ? <><dl className="record-data record-data-columns">
          <Dato nombre="Convenio">{f.convenio.codigo} · versión {f.convenio.version}</Dato><Dato nombre="Nombre">{f.convenio.nombre}</Dato>
          <Dato nombre="Vigencia desde">{fechaVisible(f.convenio.desde)}</Dato>
          <Dato nombre="Vigencia hasta">{f.convenio.hasta ? fechaVisible(f.convenio.hasta) : "Sin fecha registrada"}</Dato>
          <Dato nombre="Periodicidad pactada">{f.convenio.periodicidad}</Dato>
          <Dato nombre="PDF contractual">{f.convenio.pdfRegistrado ? "Referencia registrada" : "Pendiente de incorporar"}</Dato>
        </dl><p className="record-note preserve-lines">{f.convenio.condiciones || "Sin condiciones registradas."}</p></> :
          <p className="muted-copy">{f.convenioReferenciado ? "No se encontró un convenio válido para el donante de esta recepción." : "Esta recepción no tiene un convenio asociado. Los aportes ocasionales pueden registrarse sin contrato."}</p>}
      </Card>}
      <Card titulo={donacion ? "Productos y lotes recibidos" : "Cantidades por lote"} wide>
        {donacion ? f.lotes.length ? <div className="table-scroll" role="region" aria-label="Lotes recibidos" tabIndex={0}>
          <table className="operations-table"><thead><tr><th scope="col">Lote / producto</th><th scope="col">Recibido</th><th scope="col">En bodega</th><th scope="col">Reservado</th><th scope="col">Libre</th><th scope="col">Zona / conservación</th><th scope="col">Vencimiento / estado</th></tr></thead>
            <tbody>{f.lotes.map(l => <tr key={l.id}><td><strong>{l.codigo}</strong>{l.producto}<small>{l.categoria}</small></td>
              <td>{cantidadVisible(l.cantidadRecibida, l.unidad || "")}</td><td>{cantidadVisible(l.enBodega, l.unidad || "")}</td>
              <td>{cantidadVisible(l.reservada, l.unidad || "")}</td><td>{cantidadVisible(l.libre, l.unidad || "")}</td>
              <td>{ZONAS[l.zona || ""] || "Sin zona"}<small>{l.conservacion}</small></td>
              <td>{fechaVisible(l.vencimiento)}<small>{l.estado}</small></td></tr>)}</tbody></table></div> : <p className="muted-copy">No hay lotes asociados a esta recepción.</p> :
          <div className="table-scroll" role="region" aria-label="Cantidades de la entrega" tabIndex={0}>
            <table className="operations-table"><thead><tr><th scope="col">Lote / producto</th><th scope="col">Programada</th><th scope="col">Reserva activa</th><th scope="col">Entregada</th><th scope="col">Zona</th><th scope="col">Vencimiento</th></tr></thead>
              <tbody>{f.lineasEntrega.map((i, n) => <tr key={i.loteId || n}><td><strong>{i.lote?.codigo || "Lote no disponible"}</strong>{i.lote?.producto || "Sin registro"}</td>
                <td>{cantidadVisible(i.programada, i.unidad || "")}</td><td>{cantidadVisible(i.reservada, i.unidad || "")}</td>
                <td>{cantidadVisible(i.entregada, i.unidad || "")}</td><td>{ZONAS[i.lote?.zona || ""] || "Sin zona"}</td><td>{fechaVisible(i.lote?.vencimiento || null)}</td></tr>)}</tbody>
            </table></div>}
        <p className="record-note">{donacion ? "Los saldos de bodega y reservas son los actuales. Una cantidad libre no garantiza que el lote sea apto: revisa su estado y vencimiento." : "La reserva no es una salida física. En registros históricos puede no constar la cantidad originalmente programada."}</p>
        {donacion && f.lotes.some(l => l.atributos.length > 0) && <details className="record-attributes"><summary>Características registradas de los lotes</summary>
          {f.lotes.filter(l => l.atributos.length > 0).map(l => <div key={l.id}><strong>{l.codigo}</strong><dl className="record-data record-data-columns">{l.atributos.map(a => <Dato key={a.nombre} nombre={a.nombre}>{a.valor}</Dato>)}</dl></div>)}
        </details>}
      </Card>
      <Card titulo="Autor del registro"><DatosPersona persona={f.autor} sinDatos={f.autorReferenciado ? "La cuenta asociada no está disponible." : "Autor de registro no confirmado."} />
        {!f.autorReferenciado && <p className="record-note">El responsable de la entrega no demuestra quién creó el registro histórico.</p>}</Card>
      {!donacion && <Card titulo={f.estado === "programada" || f.estado === "cancelada" ? "Responsable previsto" : "Responsable de la entrega"}>
        <DatosPersona persona={f.estado === "programada" || f.estado === "cancelada" ? f.responsablePrevisto : f.responsableEntrega} />
        {f.responsablePrevisto && f.responsableEntrega && f.responsablePrevisto.id !== f.responsableEntrega.id && <p className="record-note">Responsable previsto: {f.responsablePrevisto.nombre}.</p>}
      </Card>}
      <Card titulo="Revisión administrativa"><dl className="record-data">
        <Dato nombre="Revisado por">{f.revision.persona?.nombre}</Dato><Dato nombre="Fecha de revisión">{fechaVisible(f.revision.fecha, true)}</Dato>
        <Dato nombre="Rol al revisar">{f.revision.rolAlRevisar === "administrador" ? "Administración" : f.revision.rolAlRevisar}</Dato>
        <Dato nombre="Versión revisada">{cantidadVisible(f.revision.version)}</Dato>
        <Dato nombre="Observación administrativa"><span className="preserve-lines">{f.revision.observacion || "Sin observación registrada"}</span></Dato>
      </dl></Card>
      <Card titulo="Documentos y fotografías">
        <p className="muted-copy">{f.archivos.length} {f.archivos.length === 1 ? "archivo asociado" : "archivos asociados"} a esta {donacion ? "recepción" : "entrega"}.</p>
        {f.archivos.length ? <ul className="record-files">{f.archivos.map(a => <li key={a.id}><strong>{a.nombre || "Archivo sin nombre"}</strong>
          <span>{a.tipo || "Archivo"} · {fechaVisible(a.fecha)} · {cantidadVisible(a.bytes, "bytes")}</span>
          {a.descripcion && <p>{a.descripcion}</p>}</li>)}</ul> : <div className="evidence-empty"><span aria-hidden="true">▧</span><p>No hay documentos ni fotografías vinculados.</p></div>}
        {f.archivosNoDisponibles > 0 && <p className="record-note">{f.archivosNoDisponibles} referencias no están disponibles para esta operación.</p>}
        <p className="record-note">La revisión requiere al menos una fotografía propia de la {donacion ? "recepción" : "entrega"} y la validación manual de administración.</p>
      </Card>
      <Card titulo="Observaciones e historial" wide>
        <p className="preserve-lines">{f.observaciones || "Sin observaciones adicionales."}</p>
        {f.historial.length ? <ol className="record-history">{f.historial.map((h, i) => <li key={i}>
          <strong>{h.accion || "Acción registrada"}</strong><span>{fechaVisible(h.fecha, true)} · {h.persona?.nombre || "Responsable no disponible"}{h.version !== null ? ` · versión ${h.version}` : ""}</span>
          {h.detalle && <p className="preserve-lines">{h.detalle}</p>}</li>)}</ol> : <p className="muted-copy">No hay acciones registradas en el historial de este expediente.</p>}
        {f.migradaEn && <p className="record-note">Registro importado del modelo anterior el {fechaVisible(f.migradaEn, true)}. Esta fecha corresponde a la migración, no a la creación de la operación.</p>}
      </Card>
    </div>
  </AppFrame>;
}
