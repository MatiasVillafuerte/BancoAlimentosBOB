import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { crearHash, comprobarPassword, compararSinCuenta, MAX_PASSWORD, MIN_PASSWORD } from "./password";
import { ROLES, type AlmacenAutenticacion, type SesionGuardada, type UsuarioAutenticacion, type UsuarioPublico } from "./types";

export const DURACION_SESION_MS = 8 * 60 * 60 * 1000;
export const VENTANA_INTENTOS_MS = 15 * 60 * 1000;
export const MAX_INTENTOS = 5;
export const MAX_SESIONES = 5;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(MAX_PASSWORD)
}).strict();
const cambioSchema = z.object({
  passwordActual: z.string().min(1).max(MAX_PASSWORD),
  passwordNueva: z.string().min(MIN_PASSWORD).max(MAX_PASSWORD),
  confirmacion: z.string().min(MIN_PASSWORD).max(MAX_PASSWORD)
}).strict().refine(v => v.passwordNueva === v.confirmacion);

export class ErrorAcceso extends Error {
  constructor(public readonly codigo: "credenciales" | "sesion" | "password" | "datos") {
    super(codigo);
  }
}

function publico(u: UsuarioAutenticacion): UsuarioPublico {
  return { id: u.id, nombre: u.nombre, email: u.email, telefono: u.telefono, rol: u.rol };
}
function habilitado(u: UsuarioAutenticacion | null): u is UsuarioAutenticacion {
  return Boolean(u?.activo && ROLES.includes(u.rol));
}
export function huellaToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function interpretarCookie(cookie: string | undefined) {
  const partes = /^([a-f0-9]{24})\.([A-Za-z0-9_-]{43})$/.exec(cookie ?? "");
  return partes ? { id: partes[1], tokenHash: huellaToken(partes[2]) } : null;
}
function nuevaSesion(id: string, ahora: Date) {
  const token = randomBytes(32).toString("base64url");
  const registro: SesionGuardada = {
    tokenHash: huellaToken(token), creadaEn: ahora, expiraEn: new Date(ahora.getTime() + DURACION_SESION_MS)
  };
  return { cookie: id + "." + token, registro };
}

export class ServicioAutenticacion {
  constructor(private readonly almacen: AlmacenAutenticacion,
    private readonly reloj: () => Date = () => new Date()) {}

  async ingresar(entrada: unknown) {
    const datos = loginSchema.safeParse(entrada);
    if (!datos.success) throw new ErrorAcceso("credenciales");
    const ahora = this.reloj();
    const usuario = await this.almacen.reservarIntento(datos.data.email, ahora);
    if (!habilitado(usuario) || !usuario.passwordHash) {
      await compararSinCuenta(datos.data.password);
      throw new ErrorAcceso("credenciales");
    }
    if (!await comprobarPassword(usuario.passwordHash, datos.data.password)) throw new ErrorAcceso("credenciales");
    const sesion = nuevaSesion(usuario.id, ahora);
    if (!await this.almacen.agregarSesion(usuario, sesion.registro)) throw new ErrorAcceso("credenciales");
    return { usuario: publico(usuario), cookie: sesion.cookie, expiraEn: sesion.registro.expiraEn };
  }

  async usuarioActual(cookie: string | undefined): Promise<UsuarioPublico | null> {
    const token = interpretarCookie(cookie);
    if (!token) return null;
    const usuario = await this.almacen.buscarSesion(token.id, token.tokenHash, this.reloj());
    return habilitado(usuario) ? publico(usuario) : null;
  }

  async salir(cookie: string | undefined) {
    const token = interpretarCookie(cookie);
    if (token) await this.almacen.eliminarSesion(token.id, token.tokenHash);
  }

  async cambiarPassword(cookie: string | undefined, entrada: unknown) {
    const datos = cambioSchema.safeParse(entrada);
    if (!datos.success) throw new ErrorAcceso("datos");
    const token = interpretarCookie(cookie);
    if (!token) throw new ErrorAcceso("sesion");
    const ahora = this.reloj();
    const usuario = await this.almacen.buscarSesion(token.id, token.tokenHash, ahora);
    if (!habilitado(usuario) || !usuario.passwordHash) throw new ErrorAcceso("sesion");
    const intento = await this.almacen.reservarIntento(usuario.email, ahora);
    if (!habilitado(intento) || intento.id !== usuario.id || intento.passwordHash !== usuario.passwordHash) {
      await compararSinCuenta(datos.data.passwordActual);
      throw new ErrorAcceso("password");
    }
    if (!await comprobarPassword(usuario.passwordHash, datos.data.passwordActual)) throw new ErrorAcceso("password");
    const nuevoHash = await crearHash(datos.data.passwordNueva);
    const sesion = nuevaSesion(usuario.id, ahora);
    if (!await this.almacen.cambiarPassword(usuario, token.tokenHash, nuevoHash, sesion.registro)) {
      throw new ErrorAcceso("sesion");
    }
    return { cookie: sesion.cookie, expiraEn: sesion.registro.expiraEn };
  }
}
