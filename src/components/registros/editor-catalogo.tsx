"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Area, Campo, SelectorDonante, dato, opcional, useGuardar } from "./campos";
import { ROLES_REGISTRO, TIPOS_DONANTE, type Catalogo, type FichaCatalogo } from "@/lib/registros/modelo";
import type { UsuarioPublico } from "@/lib/auth/types";
import { rolVisible } from "../app-frame";

export function EditorCatalogo({ tipo, ficha, nuevaVersion, soloLectura, usuario, cerrar, guardado }: {
  tipo: Catalogo; ficha?: FichaCatalogo; nuevaVersion?: boolean; soloLectura: boolean; usuario: UsuarioPublico;
  cerrar: () => void; guardado: (texto: string) => void
}) {
  const router = useRouter();
  const { guardar, pendiente, error, incierto } = useGuardar();
  const [donanteId, setDonante] = useState(ficha?.donanteId || "");
  const editar = !!ficha && !nuevaVersion;
  const propia = tipo === "usuarios" && ficha?.id === usuario.id;
  const titulos = { donantes: "donante", organizaciones: "organización", convenios: "convenio", usuarios: "cuenta" };
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    let datos: object;
    if (tipo === "donantes") datos = { nombre: dato(f, "nombre"), tipo: dato(f, "tipo"), nit: opcional(f, "nit"), direccion: opcional(f, "direccion"),
      activo: f.get("activo") === "on", contacto: { nombre: opcional(f, "contactoNombre"), telefono: opcional(f, "contactoTelefono"),
        email: opcional(f, "contactoEmail"), funcion: opcional(f, "contactoFuncion"), medio: opcional(f, "contactoMedio") } };
    else if (tipo === "organizaciones") datos = { nombre: dato(f, "nombre"), tipo: dato(f, "tipo"), direccion: dato(f, "direccion"), zona: dato(f, "zona"),
      responsable: { nombre: dato(f, "responsableNombre"), telefono: dato(f, "responsableTelefono") },
      poblacion: { ninos: Number(dato(f, "ninos")), adultosMayores: Number(dato(f, "adultosMayores")), total: Number(dato(f, "total")) }, activa: f.get("activo") === "on" };
    else if (tipo === "convenios") datos = { donanteId, anteriorId: nuevaVersion ? ficha?.id : undefined,
      nombre: dato(f, "nombre"), desde: dato(f, "desde"), hasta: opcional(f, "hasta"), condiciones: dato(f, "condiciones"), periodicidad: opcional(f, "periodicidad") };
    else datos = { nombre: dato(f, "nombre"), email: dato(f, "email"), telefono: dato(f, "telefono"),
      rol: propia ? "administrador" : dato(f, "rol"), activo: propia || f.get("activo") === "on",
      passwordInicial: String(f.get("passwordInicial") || "") || undefined };
    const res = await guardar(`/api/${tipo}${editar ? "/" + ficha!.id : ""}`, { ...datos, ...(editar ? { versionDatos: ficha!.versionDatos } : {}) }, editar);
    if (res) { guardado(editar ? "Cambios guardados." : tipo === "convenios" ? "Versión de convenio guardada. El PDF queda pendiente." : "Registro creado."); router.refresh(); }
  }
  return <section className="panel-card registro-editor" aria-labelledby="titulo-editor">
    <div className="registro-encabezado"><div><span className="eyebrow text-red">{soloLectura ? "INFORMACIÓN" : nuevaVersion ? "NUEVA VERSIÓN" : editar ? "ACTUALIZAR" : "NUEVO REGISTRO"}</span>
      <h2 id="titulo-editor">{ficha && !nuevaVersion ? ficha.nombre : `${nuevaVersion ? "Renovar" : "Registrar"} ${titulos[tipo]}`}</h2></div>
      <button className="button button-secondary" type="button" onClick={cerrar} disabled={pendiente}>Cerrar</button></div>
    <form onSubmit={enviar} aria-busy={pendiente}>
      <fieldset disabled={pendiente || soloLectura || incierto} className="registro-fieldset">
        <div className="registro-grid">
          {tipo === "convenios" && (nuevaVersion || soloLectura ? <div className="registro-ancho registro-contexto">
            <strong>{ficha?.donanteNombre}</strong><p>{ficha?.codigo} · versión {ficha?.version}{nuevaVersion && ` → versión ${(ficha?.version || 0) + 1}`}</p>
          </div> : <SelectorDonante valor={donanteId} onChange={setDonante} />)}
          <Campo label={tipo === "convenios" ? "Nombre del convenio" : "Nombre"} name="nombre" defaultValue={ficha?.nombre} required maxLength={160} />
          {tipo === "donantes" && <>
            <label className="registro-campo"><span>Tipo de donante *</span><select name="tipo" defaultValue={ficha?.tipo || "persona"} required>
              {TIPOS_DONANTE.filter(t => usuario.rol !== "voluntario" || t === "persona").map(t => <option key={t} value={t}>{t === "persona" ? "Persona / donante ocasional" : t}</option>)}</select></label>
            <Campo label="NIT (opcional)" name="nit" defaultValue={ficha?.nit} maxLength={40} />
            <Campo label="Dirección (opcional)" name="direccion" defaultValue={ficha?.direccion} maxLength={300} />
            <Campo label="Persona de contacto (opcional)" name="contactoNombre" defaultValue={ficha?.contacto?.nombre} maxLength={160} />
            <Campo label="Teléfono de contacto (opcional)" name="contactoTelefono" defaultValue={ficha?.contacto?.telefono} maxLength={40} type="tel" />
            <Campo label="Correo de contacto (opcional)" name="contactoEmail" defaultValue={ficha?.contacto?.email} type="email" maxLength={254} />
            <Campo label="Función del contacto (opcional)" name="contactoFuncion" defaultValue={ficha?.contacto?.funcion} maxLength={160} />
            <Campo label="Medio de contacto (opcional)" name="contactoMedio" defaultValue={ficha?.contacto?.medio} maxLength={160} />
          </>}
          {tipo === "organizaciones" && <>
            <Campo label="Tipo de organización" name="tipo" defaultValue={ficha?.tipo} placeholder="Comedor, centro de acogida…" required maxLength={80} />
            <Campo label="Dirección" name="direccion" defaultValue={ficha?.direccion} required maxLength={300} />
            <Campo label="Zona o barrio" name="zona" defaultValue={ficha?.zona} required maxLength={100} hint="Ubicación de la organización; no es una zona del almacén." />
            <Campo label="Responsable de contacto" name="responsableNombre" defaultValue={ficha?.responsable?.nombre} required maxLength={160} />
            <Campo label="Teléfono del responsable" name="responsableTelefono" defaultValue={ficha?.responsable?.telefono} type="tel" required maxLength={40} />
            <Campo label="Niños" name="ninos" defaultValue={ficha?.poblacion?.ninos ?? 0} type="number" min={0} max={1000000} step={1} required />
            <Campo label="Adultos mayores" name="adultosMayores" defaultValue={ficha?.poblacion?.adultosMayores ?? 0} type="number" min={0} max={1000000} step={1} required />
            <Campo label="Población total" name="total" defaultValue={ficha?.poblacion?.total ?? 0} type="number" min={0} max={1000000} step={1} required hint="Incluye niños, adultos mayores y otras personas atendidas." />
          </>}
          {tipo === "convenios" && <>
            <Campo label="Inicio de vigencia" name="desde" defaultValue={nuevaVersion ? undefined : ficha?.desde} type="date" required />
            <Campo label="Fin de vigencia (opcional)" name="hasta" defaultValue={nuevaVersion ? undefined : ficha?.hasta} type="date" />
            <Campo label="Periodicidad pactada (opcional)" name="periodicidad" defaultValue={ficha?.periodicidad} maxLength={300} hint="Registra solo lo acordado; no se presupone una frecuencia de donación." />
            <Area label="Condiciones acordadas" name="condiciones" defaultValue={ficha?.condiciones} required maxLength={6000} />
          </>}
          {tipo === "usuarios" && <>
            <Campo label="Correo de acceso" name="email" defaultValue={ficha?.email} type="email" required maxLength={254} autoComplete="off" />
            <Campo label="Teléfono" name="telefono" defaultValue={ficha?.telefono} type="tel" required maxLength={40} />
            <label className="registro-campo"><span>Rol *</span><select name="rol" defaultValue={ficha?.rol || "voluntario"} disabled={propia}>
              {ROLES_REGISTRO.map(rol => <option key={rol} value={rol}>{rolVisible[rol]}</option>)}</select></label>
            {!ficha?.tieneAcceso && <Campo label="Contraseña inicial" name="passwordInicial" type="password" autoComplete="new-password" minLength={15} maxLength={128} required={!editar}
              hint={editar ? "15–128 caracteres. Completa este campo para habilitar el acceso; vacío conserva la cuenta sin contraseña." : "15–128 caracteres. El titular puede cambiarla después desde Mi cuenta."} />}
            {ficha?.tieneAcceso && <p className="registro-ancho muted">Esta cuenta ya tiene contraseña. Su titular puede cambiarla desde Mi cuenta.</p>}
          </>}
          {tipo !== "convenios" && <label className="registro-check registro-ancho"><input name="activo" type="checkbox" defaultChecked={ficha?.activo ?? true} disabled={propia || usuario.rol === "voluntario"} />
            {tipo === "usuarios" ? "Cuenta activa" : "Disponible para nuevas operaciones"}</label>}
          {tipo === "donantes" && usuario.rol === "voluntario" && <input name="activo" type="hidden" value="on" />}
        </div>
      </fieldset>
      {tipo === "donantes" && <p className="registro-ayuda">Una donación ocasional no requiere NIT ni convenio. Busca primero al donante para evitar registros repetidos.</p>}
      {tipo === "convenios" && <p className="registro-ayuda">Cada versión conserva sus condiciones y las donaciones vinculadas. La carga del PDF se habilitará en la etapa de evidencias.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {incierto && <p role="status">El formulario conserva el envío original. Reintenta antes de iniciar otro registro.</p>}
      {!soloLectura && <div className="registro-acciones"><span>* Campos obligatorios</span><button className="button" type="submit" disabled={pendiente}>
        {pendiente ? "Guardando…" : incierto ? "Reintentar envío" : editar ? "Guardar cambios" : tipo === "convenios" ? "Guardar versión" : "Crear registro"}</button></div>}
    </form>
  </section>;
}
