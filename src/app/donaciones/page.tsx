import { ListaOperaciones, type ParametrosPagina } from "@/components/operaciones/lista";
export const metadata = { title: "Donaciones" };
export const dynamic = "force-dynamic";
export default function Donaciones({ searchParams }: { searchParams: ParametrosPagina }) {
  return <ListaOperaciones tipo="donaciones" searchParams={searchParams} />;
}
