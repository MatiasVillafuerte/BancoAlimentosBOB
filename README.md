# Banco de Alimentos de Bolivia

Proyecto final de Base de Datos III (Universidad Privada del Valle, Cochabamba).
Prototipo académico con datos ficticios: React y Next.js con TypeScript, MongoDB Atlas y diseño de archivos en GridFS.

## Funciones implementadas

- Inicio de sesión con Argon2id y una cuenta existente en `voluntarios`.
- Sesiones revocables de ocho horas, con cookie HttpOnly y máximo cinco sesiones por cuenta.
- Cierre de sesión y cambio de contraseña que invalida las sesiones anteriores.
- Verificación del rol y del estado activo en cada solicitud protegida.
- Resumen conectado a Atlas: donaciones, entregas y pendientes documentales.
- Cuenta personal con nombre, correo, teléfono y rol.

El administrador ve los contadores generales. Las otras cuentas ven sus registros con autor confirmado.
Los formularios de donaciones, inventario, reservas, entregas, archivos y revisión administrativa siguen pendientes.
El contrato completo está en [docs/02-contrato-api.md](docs/02-contrato-api.md).

## Ejecutar

Requisito: Node.js 22.13 o posterior; verificado con Node.js 24.13.1.

```powershell
npm ci
Copy-Item .env.example .env.local
```

Completa `.env.local` con la conexión privada y conserva `MONGODB_DB=bab_donaciones`.
Si ya tienes ese archivo configurado, no lo reemplaces.

```powershell
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Para ejecutar la versión optimizada:
`npm run build` y después `npm start`.

## Cuenta administradora

`npm run admin:init` activa únicamente `admin.demo@example.com` si existe, está activa,
tiene rol `administrador` y todavía carece de contraseña. La contraseña aleatoria inicial se
guarda en `.runtime/admin-inicial.json`, excluido de Git. El comando no reemplaza una contraseña existente.
Cámbiala desde **Mi cuenta** y elimina después ese archivo local.

La guía de conexión, acceso y commits está en [docs/04-desarrollo-y-git.md](docs/04-desarrollo-y-git.md).

## Estructura

| Ruta | Contenido |
| --- | --- |
| `src/app` | Páginas React y rutas de API de Next.js |
| `src/lib/auth` | Contraseñas, sesiones, validación y acceso a usuarios |
| `scripts/inicializar-admin.ts` | Activación idempotente de la cuenta inicial |
| `tests` | Pruebas de autenticación sin conectarse a Atlas |
| `db/migraciones` | Migración V2 y sus pruebas |
| `db/esquema-autenticacion.cjs` | Extensión opcional del validador de voluntarios |
| `frontend` | Maquetas HTML originales como referencia |
| `docs` | Contrato funcional y guías |

## Validar y colaborar

```powershell
npm test
npm run lint
npm run typecheck
npm run build
```

El proyecto base se publicó primero en `main` (commit `4a611e6`).
La primera implementación está en `feat/backend-auth`.
Repositorio: [MatiasVillafuerte/BancoAlimentosBOB](https://github.com/MatiasVillafuerte/BancoAlimentosBOB).

## Base migrada

La migración V2 quedó verificada el 25 de noviembre de 2026 y conservó 49 documentos de negocio.
Las contraseñas de otras cuentas y los PDF de tres convenios de ejemplo siguen pendientes.
El script de autenticación amplía `voluntarios`; no vuelve a ejecutar la migración operativa.

`db/seed.js` y los JSON son material de la versión previa. **No ejecutes el seed en la base migrada:
borra colecciones.** Las variables privadas, los respaldos y las credenciales iniciales están excluidos de Git.
