import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/auth/http";
export default async function Inicio() {
  redirect(await usuarioActual() ? "/panel" : "/login");
}
