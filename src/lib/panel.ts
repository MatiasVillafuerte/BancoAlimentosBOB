import "server-only";
import { obtenerBase } from "./db";
import type { UsuarioPublico } from "./auth/types";
import { alcanceOperaciones } from "./operaciones/modelo";

export async function consultarPanel(usuario: UsuarioPublico) {
  const bd = await obtenerBase();
  const filtro = alcanceOperaciones(usuario);
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
