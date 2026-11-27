import "server-only";
import { obtenerBase, obtenerCliente } from "../db";
import { ServicioDocumentos } from "./servicio";

export async function servicioDocumentos() { return new ServicioDocumentos(await obtenerCliente(), await obtenerBase()); }
