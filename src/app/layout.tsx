import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Banco de Alimentos de Bolivia", template: "%s · BAB" },
  description: "Sistema académico de expedientes y trazabilidad de donaciones."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
