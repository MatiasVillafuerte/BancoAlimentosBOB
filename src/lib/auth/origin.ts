const DIRECCIONES_LOCALES = new Set(["localhost", "127.0.0.1"]);

export function origenPermitido(origen: string | null, configurado: URL): boolean {
  if (!origen) return false;
  if (origen === configurado.origin) return true;
  // Next muestra 127.0.0.1 al escuchar en loopback; APP_URL puede usar localhost.
  // La excepción exige configuración local y conserva protocolo y puerto.
  if (!DIRECCIONES_LOCALES.has(configurado.hostname)) return false;
  try {
    const recibido = new URL(origen);
    return recibido.origin === origen
      && DIRECCIONES_LOCALES.has(recibido.hostname)
      && recibido.protocol === configurado.protocol
      && recibido.port === configurado.port;
  } catch {
    return false;
  }
}
