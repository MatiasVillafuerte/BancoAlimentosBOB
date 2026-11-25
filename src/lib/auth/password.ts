import argon2 from "argon2";
import { randomBytes } from "node:crypto";

export const MIN_PASSWORD = 15;
export const MAX_PASSWORD = 128;
export const OPCIONES_ARGON2 = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function crearHash(password: string): Promise<string> {
  return argon2.hash(password, OPCIONES_ARGON2);
}

export async function comprobarPassword(hash: string, password: string): Promise<boolean> {
  if (!hash.startsWith("$argon2id$")) return false;
  try { return await argon2.verify(hash, password); } catch { return false; }
}

let hashFicticio: Promise<string> | undefined;
export async function compararSinCuenta(password: string) {
  // Mantener el coste de verificación cuando el correo no existe o está bloqueado.
  hashFicticio ??= crearHash(randomBytes(32).toString("base64url"));
  await comprobarPassword(await hashFicticio, password);
}
