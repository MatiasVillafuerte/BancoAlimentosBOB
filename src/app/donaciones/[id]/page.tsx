import { FichaDeOperacion } from "@/components/operaciones/ficha";
export const metadata = { title: "Información de donación" };
export const dynamic = "force-dynamic";
export default async function Donacion({ params }: { params: Promise<{ id: string }> }) {
  return <FichaDeOperacion tipo="donaciones" id={(await params).id} />;
}
