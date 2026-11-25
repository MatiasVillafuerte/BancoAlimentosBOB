# Banco de Alimentos de Bolivia · Sistema de expedientes de donaciones

Proyecto final de Base de Datos III (Universidad Privada del Valle, Cochabamba).
Prototipo académico con datos ficticios. Base de datos: MongoDB Atlas (M0) con GridFS.

## Modelo aprobado y migración

Las reglas aprobadas el 24 de noviembre de 2026 están en [el contrato de la aplicación](docs/02-contrato-api.md): reservas, autor automático desde la sesión, evidencias múltiples, alertas administrativas y cierre como completada tras revisión.

La base ya cargada se actualiza con [la guía de migración](docs/01-subir-a-atlas.md), usando mongosh independiente desde PowerShell/Terminal; la consola integrada de Compass utilizada en este proyecto no admite load(). El ejecutor en db/migraciones comienza en modo de revisión, sin escrituras. Al aplicar genera un respaldo local y conserva los identificadores y cantidades.

La migración quedó aplicada y verificada en Atlas el 25 de noviembre de 2026. La revisión final confirmó 49 documentos conservados, cero documentos por actualizar, cero índices por crear y cero errores. Las contraseñas de las cinco cuentas y los PDF de tres convenios siguen pendientes.

Los HTML, los JSON y el seed son referencias de la versión anterior. No ejecutes de nuevo el seed sobre la base que quieres conservar, porque borra colecciones. La siguiente etapa es implementar el backend y la interfaz nueva con Next.js, React y TypeScript, incluyendo la inicialización de cuentas y el inicio de sesión.

## Estructura

| Carpeta | Qué hay | Quién |
| --- | --- | --- |
| `frontend/` | 15 páginas HTML con los colores del banco, ya enlazadas entre sí | Los dos |
| `db/` | `seed.js` (colecciones, validación, índices y datos de ejemplo) y `datos/*.json` | Keyra |
| `backend/` | API que conecta el frontend con MongoDB (por crear) | Matias |
| `docs/` | Subir la base a Atlas, contrato de la API y plan de la presentación | Los dos |

## Ver el frontend

Abre `frontend/login.html` en el navegador (o `frontend/index.html` para el panel).
No necesita servidor: por ahora muestra datos de ejemplo escritos en la página.

## Subir la base de datos a Atlas

Mira `docs/01-subir-a-atlas.md`.

## Variables de entorno

Copia `.env.example` a `.env` y completa la cadena de conexión. `.env` está en `.gitignore`: nunca se sube.

## Páginas

| Archivo | Pantalla |
| --- | --- |
| `login.html` | 01 Inicio de sesión |
| `index.html` | 02 Panel de bodega |
| `donantes.html` | 03 Donantes y convenios |
| `donaciones.html` | 04 Donaciones |
| `nuevadonacion.html` | 05 Registrar donación |
| `inventario.html` | 06 Inventario (FEFO) |
| `lote.html` | 07 Ficha de lote |
| `movimientos.html` | 08 Movimientos |
| `entregas.html` | 09 Entregas |
| `nuevaentrega.html` | 10 Registrar entrega |
| `organizaciones.html` | 11 Organizaciones |
| `trazabilidad.html` | 12 Trazabilidad |
| `archivos.html` | 13 Archivos |
| `informes.html` | 14 Informes |
| `usuarios.html` | 15 Usuarios y roles |
