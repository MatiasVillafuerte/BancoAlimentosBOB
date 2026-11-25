# Backend con Next.js

La API está en `src/app/api` y la lógica del servidor en `src/lib`.
Next.js sirve tanto la interfaz React como estas rutas; no hace falta iniciar otro servidor Express.

Esta carpeta conserva el `.env` local anterior como referencia. La aplicación nueva usa
`.env.local` en la raíz del proyecto, siempre excluido de Git. Consulta
[la guía de desarrollo](../docs/04-desarrollo-y-git.md) y [el contrato funcional](../docs/02-contrato-api.md).
