import { MongoClient, BSON } from "mongodb";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { crearHash } from "../src/lib/auth/password";
import { esquemaAutenticacion } from "../db/esquema-autenticacion.cjs";

const email = "admin.demo@example.com";
const raiz = resolve(import.meta.dirname, "..");
const local = resolve(raiz, ".env.local");
const variables = existsSync(local) ? parseEnv(readFileSync(local, "utf8")) : {};
const uri = process.env.MONGODB_URI || variables.MONGODB_URI;
const base = process.env.MONGODB_DB || variables.MONGODB_DB;

async function inicializar() {
  if (!uri || base !== "bab_donaciones") throw new Error("Configura MONGODB_URI y MONGODB_DB=bab_donaciones en .env.local.");
  const cliente = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    await cliente.connect();
    const bd = cliente.db(base);
    const usuario = await bd.collection("voluntarios").findOne({ email });
    if (!usuario || usuario.rol !== "administrador" || !usuario.activo) {
      throw new Error("La cuenta administrativa esperada no existe, no está activa o no tiene ese rol.");
    }
    if (usuario.passwordHash) {
      console.log("La cuenta ya tiene contraseña. No se reemplazó ni se cambió ninguna sesión.");
      return;
    }
    const directorio = resolve(raiz, ".runtime");
    mkdirSync(directorio, { recursive: true });
    const archivo = resolve(directorio, "admin-inicial.json");
    let password: string;
    if (existsSync(archivo)) {
      const anterior = JSON.parse(readFileSync(archivo, "utf8"));
      if (anterior.correo !== email || typeof anterior.password !== "string" || anterior.password.length < 24) {
        throw new Error("El archivo local de acceso no coincide con esta cuenta. Revísalo antes de continuar.");
      }
      password = anterior.password;
    } else {
      password = randomBytes(24).toString("base64url");
      writeFileSync(archivo, JSON.stringify({ correo: email, password,
        nota: "Credencial inicial privada. Cambia la contraseña desde Mi cuenta y elimina este archivo." }, null, 2),
      { encoding: "utf8", mode: 0o600, flag: "wx" });
    }
    const info = await bd.listCollections({ name: "voluntarios" }, { nameOnly: false }).next();
    if (!info || !("options" in info)) throw new Error("No se pudo leer el esquema de la colección voluntarios.");
    const anterior = info.options?.validator || {};
    const serializar = (x: unknown) => BSON.EJSON.stringify(x);
    const yaAmpliado = Array.isArray(anterior.$and) && anterior.$and.some((x: unknown) => serializar(x) === serializar(esquemaAutenticacion));
    const nuevo = yaAmpliado ? anterior : { $and: [anterior, esquemaAutenticacion] };
    if (await bd.collection("voluntarios").countDocuments({ $nor: [nuevo] })) {
      throw new Error("Las cuentas actuales no cumplen la extensión de autenticación. No se cambió el validador.");
    }
    const respaldo = resolve(directorio, "validador-voluntarios-anterior.ejson");
    if (!existsSync(respaldo)) writeFileSync(respaldo, serializar(info.options), { flag: "wx" });
    if (!yaAmpliado) await bd.command({ collMod: "voluntarios", validator: nuevo, validationLevel: "strict", validationAction: "error" });
    const passwordHash = await crearHash(password);
    const resultado = await bd.collection("voluntarios").updateOne({
      _id: usuario._id, rol: "administrador", activo: true, passwordHash: { $exists: false }
    }, { $set: { passwordHash, passwordActualizadaEn: new Date(), sesiones: [] } });
    if (resultado.modifiedCount !== 1) throw new Error("La cuenta cambió durante la inicialización. No se sobrescribió.");
    console.log("Cuenta administradora activada: " + email);
    console.log("La contraseña inicial está únicamente en .runtime/admin-inicial.json (excluido de Git).");
  } finally { await cliente.close(); }
}

inicializar().catch(error => {
  // Los errores del driver pueden contener datos de conexión; no volcar su objeto.
  if (error?.name === "MongoServerError" || error?.name === "MongoServerSelectionError") {
    console.error("No se pudo preparar la cuenta en MongoDB. Comprueba conexión y permisos de lectura, escritura y collMod.");
  } else console.error(error instanceof Error ? error.message : "No se pudo inicializar la cuenta.");
  process.exitCode = 1;
});
