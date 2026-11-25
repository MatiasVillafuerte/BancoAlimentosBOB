import "server-only";
import { ObjectId } from "mongodb";
import { obtenerBase } from "./db";
import type { UsuarioPublico } from "./auth/types";

export async function consultarPanel(usuario: UsuarioPublico) {
  const bd = await obtenerBase();
  const filtro = usuario.rol === "administrador" ? {} : { registradaPor: new ObjectId(usuario.id) };
  const [donaciones, entregas, porDocumentarD, porDocumentarE, porRevisarD, porRevisarE, observadasD, observadasE] = await Promise.all([
    bd.collection("donaciones").countDocuments(filtro),
    bd.collection("entregas").countDocuments(filtro),
    bd.collection("donaciones").countDocuments({ ...filtro, estado: "por_documentar" }),
    bd.collection("entregas").countDocuments({ ...filtro, estado: "por_documentar" }),
    bd.collection("donaciones").countDocuments({ ...filtro, estado: "recibida" }),
    bd.collection("entregas").countDocuments({ ...filtro, estado: "entregada" }),
    bd.collection("donaciones").countDocuments({ ...filtro, estado: "observada" }),
    bd.collection("entregas").countDocuments({ ...filtro, estado: "observada" })
  ]);
  return { donaciones, entregas, porDocumentar: porDocumentarD + porDocumentarE,
    porRevisar: porRevisarD + porRevisarE, observadas: observadasD + observadasE };
}
