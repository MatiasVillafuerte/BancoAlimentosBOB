"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="fallback-page"><span className="eyebrow text-red">BANCO DE ALIMENTOS</span><h1>No pudimos cargar esta página</h1><p>Inténtalo nuevamente en unos momentos.</p><button className="button" onClick={reset}>Volver a intentar</button></main>;
}
