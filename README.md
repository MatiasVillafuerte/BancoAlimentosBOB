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
- Listas de donaciones, entregas y pendientes con búsqueda, estados y paginación.
- Fichas de operaciones con lotes, cantidades, convenio, responsables, metadatos de archivos e historial.
- Catálogos de donantes y organizaciones, con edición y disponibilidad para nuevas operaciones.
- Versiones de convenios con condiciones, vigencia y vínculo opcional en la recepción.
- Registro de recepción con hasta 30 lotes y sus movimientos de entrada, en una transacción idempotente.
- Administración de cuentas: alta, contacto, rol, activación y contraseña inicial para cuentas sin acceso.

El administrador ve los contadores generales. Las otras cuentas ven sus registros con autor confirmado.
El inventario operativo, las reservas y entregas, los archivos y la revisión administrativa siguen pendientes.
La [guía de la etapa 3](docs/06-registros-y-catalogos.md) explica cómo registrar y qué permisos tiene cada rol.
El contrato completo está en [docs/02-contrato-api.md](docs/02-contrato-api.md).
Las etapas, criterios de cierre y contenido de la entrega final están en [el plan de entrega](docs/05-plan-entrega.md).

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
| `src/lib/operaciones` | Consultas autorizadas, filtros y datos públicos de operaciones |
| `src/lib/registros` | Validación, catálogos, cuentas y transacciones de recepción |
| `scripts/inicializar-admin.ts` | Activación idempotente de la cuenta inicial |
| `tests/*.test.ts` | Pruebas de autenticación, orígenes, consultas y validación sin Atlas |
| `tests/integration` | Transacciones con validadores reales en una base temporal aislada |
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

`npm run test:integration` usa la conexión de `.env.local` para crear una base temporal
`bab_test_<identificador>`, con datos ficticios, y retira sus colecciones al terminar. Requiere
permisos de creación, lectura y escritura en esa base; no escribe en `bab_donaciones`.

El proyecto base se publicó primero en `main` (commit `4a611e6`).
La primera implementación está en `feat/backend-auth`.
Repositorio: [MatiasVillafuerte/BancoAlimentosBOB](https://github.com/MatiasVillafuerte/BancoAlimentosBOB).

## Base migrada

La migración V2 quedó verificada el 25 de noviembre de 2026 y conservó 49 documentos de negocio.
Los PDF de tres convenios de ejemplo siguen pendientes. Las cuentas sin contraseña se habilitan
individualmente desde **Equipo → Editar**; esta etapa no cambia automáticamente sus credenciales.
El script de autenticación amplía `voluntarios`; no vuelve a ejecutar la migración operativa.

`db/seed.js` y los JSON son material de la versión previa. **No ejecutes el seed en la base migrada:
borra colecciones.** Las variables privadas, los respaldos y las credenciales iniciales están excluidos de Git.
