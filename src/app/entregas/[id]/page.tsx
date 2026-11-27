import { FichaDeOperacion } from "@/components/operaciones/ficha";
export const metadata = { title: "Información de entrega" };
export const dynamic = "force-dynamic";
export default async function Entrega({ params }: { params: Promise<{ id: string }> }) {
  return <FichaDeOperacion tipo="entregas" id={(await params).id} />;
}
