import { ListaOperaciones, type ParametrosPagina } from "@/components/operaciones/lista";
export const metadata = { title: "Pendientes documentales" };
export const dynamic = "force-dynamic";
export default function Alertas({ searchParams }: { searchParams: ParametrosPagina }) {
  return <ListaOperaciones tipo="alertas" searchParams={searchParams} />;
}
