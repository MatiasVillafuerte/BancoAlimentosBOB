import assert from "node:assert/strict";
import { before, test } from "node:test";
import { ServicioAutenticacion, DURACION_SESION_MS, VENTANA_INTENTOS_MS, MAX_INTENTOS, MAX_SESIONES, interpretarCookie } from "../src/lib/auth/core";
import { crearHash, comprobarPassword } from "../src/lib/auth/password";
import type { AlmacenAutenticacion, SesionGuardada, UsuarioAutenticacion } from "../src/lib/auth/types";

const password = "Una contraseña de prueba larga";
let passwordHash: string;
before(async () => { passwordHash = await crearHash(password); });

class Memoria implements AlmacenAutenticacion {
  usuario: UsuarioAutenticacion = { id: "6a1f00000000000000000001", nombre: "Administración de prueba", email: "admin@example.com", telefono: "", rol: "administrador", activo: true, passwordHash };
  sesiones: SesionGuardada[] = [];
  intentos = 0;
  ventana = 0;
  async reservarIntento(email: string, ahora: Date) {
    if (!this.usuario.activo || email !== this.usuario.email) return null;
    if (ahora.getTime() - this.ventana >= VENTANA_INTENTOS_MS) { this.intentos = 0; this.ventana = ahora.getTime(); }
    if (this.intentos >= MAX_INTENTOS) return null;
    this.intentos++;
    return { ...this.usuario };
  }
  async agregarSesion(usuario: UsuarioAutenticacion, sesion: SesionGuardada) {
    if (!this.usuario.activo || usuario.passwordHash !== this.usuario.passwordHash) return false;
    this.sesiones = [...this.sesiones.filter(s => s.expiraEn > sesion.creadaEn), sesion].slice(-MAX_SESIONES);
    this.intentos = 0;
    return true;
  }
  async buscarSesion(id: string, tokenHash: string, ahora: Date) {
    return this.usuario.id === id && this.usuario.activo && this.sesiones.some(s => s.tokenHash === tokenHash && s.expiraEn > ahora) ? { ...this.usuario } : null;
  }
  async eliminarSesion(id: string, tokenHash: string) {
    if (id === this.usuario.id) this.sesiones = this.sesiones.filter(s => s.tokenHash !== tokenHash);
  }
  async cambiarPassword(usuario: UsuarioAutenticacion, tokenHash: string, nuevoHash: string, sesion: SesionGuardada) {
    if (usuario.passwordHash !== this.usuario.passwordHash || !await this.buscarSesion(usuario.id, tokenHash, sesion.creadaEn)) return false;
    this.usuario.passwordHash = nuevoHash;
    this.sesiones = [sesion];
    this.intentos = 0;
    return true;
  }
}
function contexto() {
  const almacen = new Memoria();
  let fecha = Date.UTC(2026, 10, 25, 12);
  return { almacen, servicio: new ServicioAutenticacion(almacen, () => new Date(fecha)), avanzar: (ms: number) => { fecha += ms; } };
}
const credenciales = { email: "admin@example.com", password };

test("Argon2id conserva la contraseña fuera del hash y verifica correctamente", async () => {
  assert.match(passwordHash, /^\$argon2id\$/);
  assert.equal(await comprobarPassword(passwordHash, password), true);
  assert.equal(await comprobarPassword(passwordHash, "incorrecta"), false);
  assert.equal(await comprobarPassword("hash inválido", password), false);
});
test("el inicio normaliza el correo y devuelve solo campos públicos", async () => {
  const { servicio, almacen } = contexto();
  const r = await servicio.ingresar({ email: " ADMIN@EXAMPLE.COM ", password });
  assert.equal(r.usuario.email, "admin@example.com");
  assert.deepEqual(Object.keys(r.usuario).sort(), ["email", "id", "nombre", "rol", "telefono"]);
  assert.equal(almacen.sesiones[0].tokenHash, interpretarCookie(r.cookie)?.tokenHash);
  assert.equal(JSON.stringify(almacen.sesiones).includes(r.cookie.split(".")[1]), false);
  assert.deepEqual(await servicio.usuarioActual(r.cookie), r.usuario);
});
test("datos manipulados y credenciales incorrectas no crean sesiones", async () => {
  const { servicio, almacen } = contexto();
  for (const input of [null, { email: { $ne: null }, password }, { ...credenciales, rol: "administrador" }, { ...credenciales, password: "incorrecta" }, { ...credenciales, email: "no-existe@example.com" }]) {
    await assert.rejects(servicio.ingresar(input), { codigo: "credenciales" });
  }
  assert.equal(almacen.sesiones.length, 0);
});
test("una cuenta inactiva o sin hash no puede iniciar sesión", async () => {
  const { servicio, almacen } = contexto();
  almacen.usuario.activo = false;
  await assert.rejects(servicio.ingresar(credenciales), { codigo: "credenciales" });
  almacen.usuario.activo = true;
  delete almacen.usuario.passwordHash;
  await assert.rejects(servicio.ingresar(credenciales), { codigo: "credenciales" });
});
test("un token falsificado, cerrado o vencido pierde acceso", async () => {
  const { servicio, avanzar } = contexto();
  const primera = await servicio.ingresar(credenciales);
  assert.equal(await servicio.usuarioActual(primera.cookie.slice(0, 25) + "A".repeat(43)), null);
  assert.equal(await servicio.usuarioActual("invalida"), null);
  await servicio.salir(primera.cookie);
  assert.equal(await servicio.usuarioActual(primera.cookie), null);
  const segunda = await servicio.ingresar(credenciales);
  avanzar(DURACION_SESION_MS);
  assert.equal(await servicio.usuarioActual(segunda.cookie), null);
});
test("cada consulta respeta cambios de rol y desactivación", async () => {
  const { servicio, almacen } = contexto();
  const r = await servicio.ingresar(credenciales);
  almacen.usuario.rol = "voluntario";
  assert.equal((await servicio.usuarioActual(r.cookie))?.rol, "voluntario");
  almacen.usuario.activo = false;
  assert.equal(await servicio.usuarioActual(r.cookie), null);
});
test("el límite de intentos impide entrar hasta que venza la ventana", async () => {
  const { servicio, avanzar } = contexto();
  for (let i = 0; i < MAX_INTENTOS; i++) await assert.rejects(servicio.ingresar({ ...credenciales, password: "errónea" }));
  await assert.rejects(servicio.ingresar(credenciales), { codigo: "credenciales" });
  avanzar(VENTANA_INTENTOS_MS);
  assert.ok((await servicio.ingresar(credenciales)).cookie);
});
test("cambiar contraseña exige la actual y revoca todas las sesiones anteriores", async () => {
  const { servicio, almacen } = contexto();
  const a = await servicio.ingresar(credenciales);
  const b = await servicio.ingresar(credenciales);
  const nueva = "Mi nueva contraseña de pruebas";
  await assert.rejects(servicio.cambiarPassword(a.cookie, { passwordActual: "mal", passwordNueva: nueva, confirmacion: nueva }), { codigo: "password" });
  const cambio = await servicio.cambiarPassword(a.cookie, { passwordActual: password, passwordNueva: nueva, confirmacion: nueva });
  assert.equal(await servicio.usuarioActual(a.cookie), null);
  assert.equal(await servicio.usuarioActual(b.cookie), null);
  assert.ok(await servicio.usuarioActual(cambio.cookie));
  assert.equal(await comprobarPassword(almacen.usuario.passwordHash!, nueva), true);
  await assert.rejects(servicio.ingresar(credenciales));
});
test("el cambio de contraseña también limita intentos fallidos", async () => {
  const { servicio } = contexto();
  const r = await servicio.ingresar(credenciales);
  for (let i = 0; i < MAX_INTENTOS; i++) await assert.rejects(servicio.cambiarPassword(r.cookie, { passwordActual: "mal", passwordNueva: password, confirmacion: password }));
  await assert.rejects(servicio.cambiarPassword(r.cookie, { passwordActual: password, passwordNueva: password, confirmacion: password }), { codigo: "password" });
});
test("se conservan cinco sesiones y se exige una nueva contraseña válida", async () => {
  const { servicio, almacen } = contexto();
  const primera = await servicio.ingresar(credenciales);
  for (let i = 0; i < MAX_SESIONES; i++) await servicio.ingresar(credenciales);
  assert.equal(almacen.sesiones.length, MAX_SESIONES);
  assert.equal(await servicio.usuarioActual(primera.cookie), null);
  const actual = await servicio.ingresar(credenciales);
  await assert.rejects(servicio.cambiarPassword(actual.cookie, { passwordActual: password, passwordNueva: "corta", confirmacion: "corta" }), { codigo: "datos" });
});
