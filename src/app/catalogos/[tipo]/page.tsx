import { notFound } from "next/navigation";
import { PaginaCatalogo } from "@/components/registros/pagina-catalogo";
import type { ParametrosPagina } from "@/components/operaciones/lista";
export const metadata = { title: "Catálogos" };
export const dynamic = "force-dynamic";
export default async function Catalogo({ params, searchParams }: { params: Promise<{ tipo: string }>; searchParams: ParametrosPagina }) {
  const { tipo } = await params;
  if (tipo !== "donantes" && tipo !== "organizaciones" && tipo !== "convenios") notFound();
  return <PaginaCatalogo tipo={tipo} searchParams={searchParams} />;
}
