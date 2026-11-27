import { PaginaCatalogo } from "@/components/registros/pagina-catalogo";
import type { ParametrosPagina } from "@/components/operaciones/lista";
export const metadata = { title: "Equipo y accesos" };
export const dynamic = "force-dynamic";
export default function Usuarios({ searchParams }: { searchParams: ParametrosPagina }) { return <PaginaCatalogo tipo="usuarios" searchParams={searchParams} />; }
