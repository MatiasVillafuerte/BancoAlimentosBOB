import Link from "next/link";
export default function NotFound() {
  return <main className="fallback-page"><h1>No encontramos esta página</h1><p>Vuelve al inicio para continuar.</p><Link className="button" href="/">Ir al inicio</Link></main>;
}
