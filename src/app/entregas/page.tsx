import { ListaOperaciones, type ParametrosPagina } from "@/components/operaciones/lista";
export const metadata = { title: "Entregas" };
export const dynamic = "force-dynamic";
export default function Entregas({ searchParams }: { searchParams: ParametrosPagina }) {
  return <ListaOperaciones tipo="entregas" searchParams={searchParams} />;
}
