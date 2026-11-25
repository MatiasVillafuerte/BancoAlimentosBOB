import "server-only";
import { MongoClient } from "mongodb";

const cache = globalThis as typeof globalThis & { babMongo?: Promise<MongoClient> };

export async function obtenerBase() {
  const uri = process.env.MONGODB_URI;
  if (!uri || process.env.MONGODB_DB !== "bab_donaciones") throw new Error("Configuración de base de datos incompleta");
  if (!cache.babMongo) {
    const cliente = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 10000 });
    cache.babMongo = cliente.connect().catch(error => { cache.babMongo = undefined; throw error; });
  }
  return (await cache.babMongo).db("bab_donaciones");
}
