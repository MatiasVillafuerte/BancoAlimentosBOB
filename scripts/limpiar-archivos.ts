import { MongoClient } from "mongodb";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { AlmacenArchivos } from "../src/lib/documentos/almacen";
import { VALIDACION_ARCHIVO } from "../src/lib/documentos/modelo";

async function main() {
  const args = process.argv.slice(2);
  if (args.some(a => a !== "--aplicar") || args.length > 1) throw new Error("Usa npm run archivos:limpiar, con -- --aplicar solo para ejecutar la limpieza.");
  const local = resolve(import.meta.dirname, "../.env.local");
  const v = existsSync(local) ? parseEnv(readFileSync(local, "utf8")) : {};
  const uri = process.env.MONGODB_URI || v.MONGODB_URI, base = process.env.MONGODB_DB || v.MONGODB_DB;
  if (!uri || base !== "bab_donaciones") throw new Error("Configura la conexión privada a bab_donaciones en .env.local.");
  const cliente = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    await cliente.connect();
    const bd = cliente.db(base), almacen = new AlmacenArchivos(cliente, bd);
    if (args.includes("--aplicar")) console.log(await almacen.limpiarAntiguos());
    else {
      const candidatos = await bd.collection("fs.files").countDocuments({ "metadata.validacion": VALIDACION_ARCHIVO,
        "metadata.estado": { $in: ["temporal", "eliminando"] }, uploadDate: { $lt: new Date(Date.now() - 24 * 3600000) } });
      console.log({ modo: "revisar", candidatos, escrituras: 0 });
      console.log("La limpieza procesa hasta 100 candidatos y conserva los que tengan referencias, incluso en el historial. Para aplicarla: npm run archivos:limpiar -- --aplicar");
    }
  } finally { await cliente.close(); }
}
main().catch(e => { console.error(e instanceof Error && !e.name.startsWith("Mongo") ? e.message : "No se pudo completar el mantenimiento. Revisa la conexión y permisos."); process.exitCode = 1; });
