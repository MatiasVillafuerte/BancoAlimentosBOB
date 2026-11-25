export function Brand({ light = false }: { light?: boolean }) {
  return <div className={"brand" + (light ? " brand-light" : "")}>
    <svg viewBox="0 0 44 44" width="44" height="44" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="42" height="42" rx="12" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 25h20l-2 10H14l-2-10ZM17 25v-7c0-5 4-8 8-9 0 6-3 10-8 12m7 4c0-5 3-8 8-9 0 5-2 8-8 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <div><strong>Banco de Alimentos</strong><span>de Bolivia</span></div>
  </div>;
}
