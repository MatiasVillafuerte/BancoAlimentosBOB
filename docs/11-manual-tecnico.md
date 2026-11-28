# Manual técnico de la entrega BAB

Actualizado el 27 de noviembre de 2026. React y el backend trabajan en el mismo proyecto Next.js.
Las rutas de servidor están en `src/app/api`, las reglas en `src/lib` y los componentes en `src/components`.
La carpeta `backend` anterior no es otro servidor que deba iniciarse.

## Instalación y ejecución

Se utiliza Node.js 22.13 o posterior; la validación local emplea Node.js 24.13.1. Instala las versiones
del archivo de bloqueo, sin actualizar dependencias durante la preparación de la presentación.

```powershell
git clone https://github.com/MatiasVillafuerte/BancoAlimentosBOB.git
Set-Location BancoAlimentosBOB
git switch feat/backend-auth
npm ci
if (!(Test-Path -LiteralPath '.env.local')) { Copy-Item -LiteralPath '.env.example' -Destination '.env.local' }
```

La copia de `.env` se hace solo si aún no existe. Completa localmente `MONGODB_URI`,
`MONGODB_DB=bab_donaciones` y `APP_URL=http://localhost:3000`. No uses prefijos `NEXT_PUBLIC_` para secretos.
Atlas necesita permitir la conexión del equipo y un usuario técnico con los permisos de lectura/escritura
requeridos. Sus permisos no sustituyen los roles de la aplicación.

```powershell
npm run dev
```

Para producción local: `npm run build`, seguido de `npm start`. Ambas modalidades usan el mismo puerto;
detén una antes de iniciar la otra. GitHub publica el código, no aloja la aplicación. El despliegue externo
requiere un entorno compatible con Node.js, HTTPS y variables privadas; no forma parte de esta entrega.

La base del proyecto ya está migrada. No ejecutes `seed.js`, no repitas migraciones ni reinicialices
credenciales para utilizar esta entrega. En un entorno nuevo, restaura una copia autorizada del modelo
y datos antes de activar las cuentas. La [guía de acceso](04-desarrollo-y-git.md) explica el alta inicial.
El clon público no contiene la base ni contraseñas y no puede reconstruir por sí solo los datos privados.

## Arquitectura y contrato

| Módulo | Responsabilidad |
| --- | --- |
| `auth` | Argon2id, sesiones revocables, cuenta vigente, origen y límites HTTP. |
| `operaciones` | Listados y fichas con proyecciones explícitas y alcance por usuario. |
| `registros` | Catálogos, cuentas, versiones de convenios y recepción transaccional. |
| `inventario` | FEFO, reservas, confirmación parcial y movimientos compensatorios. |
| `documentos` | Validación binaria, GridFS privado, versiones, revisión y reapertura. |
| `informes` | Lecturas coherentes de cantidades, situación documental y procedencia. |

El [contrato API](02-contrato-api.md) y las guías 06–09 describen cada operación. `src/lib/transacciones.ts`
ejecuta transacciones de instantánea con confirmación mayoritaria. Las escrituras serializan la autorización
con cambios de rol o desactivación. El navegador nunca suministra un autor confiable.
Las claves de operación identifican reintentos y sus huellas impiden reutilizarlas con otro contenido.
`versionDatos` evita sobrescribir cambios concurrentes. No hay operaciones paralelas dentro de una transacción.

La carga GridFS precede al vínculo transaccional con el expediente. Solo un archivo validado, vinculado
y de la entidad correcta es utilizable. Los archivos retirados conservan bytes e historial.
`npm run archivos:limpiar` muestra candidatos sin borrarlos; `npm run archivos:limpiar -- --aplicar`
retira únicamente temporales propios antiguos sin referencias, con límites descritos en la guía 08.
La validación de contenido no equivale a un antivirus ni a verificación humana de lo fotografiado.

## Comprobaciones

```powershell
npm test
npm run lint
npm run typecheck
npm run build
npm run test:integration
```

La integración requiere la conexión privada y permisos para crear y retirar colecciones en bases
temporales `bab_test_<24 caracteres hexadecimales>`. Cada prueba verifica el nombre, instala los
validadores e índices y retira sus propias colecciones. No ejecuta el seed ni escribe datos de prueba
en `bab_donaciones`. Si una interrupción externa impide limpiar, identifica la base temporal de esa
ejecución antes de retirarla; no borres bases por un patrón general.

El recorrido de aceptación reproducible está en `tests/integration/recorrido.test.ts` y en
[la guía de demostración](12-demostracion.md). Las pruebas de autenticación comprueban por separado
contraseñas, sesiones, expiración, cambios de rol y cambio de contraseña.

## Respaldo y recuperación

Antes de una intervención de datos, detén escrituras de la aplicación. Un respaldo completo debe incluir
las ocho colecciones, **ambas colecciones GridFS**, sus índices y validadores. Conserva también la versión
del código y la configuración fuera del repositorio. El EJSON de la migración inicial no contiene las
evidencias y operaciones creadas después; no es un respaldo actualizado del sistema completo.

Usa las herramientas o exportación de respaldo autorizadas de tu entorno Atlas. No publiques URI,
credenciales, sesiones ni archivos de respaldo. Conserva la copia en almacenamiento privado con acceso
controlado. El tamaño de los archivos consume espacio del mismo clúster que los documentos.

Para recuperar, restaura primero en un entorno aislado y comprueba: cantidades y reservas conciliadas,
referencias de lotes y movimientos, originales GridFS descargables, índices, validadores y acceso por roles.
Revoca las sesiones restauradas antes de habilitar el entorno recuperado. No sobrescribas la base en uso
ni ejecutes la reversión de la migración inicial sobre operaciones posteriores. La recuperación completa
de un respaldo de producción no se ensayó en esta entrega; requiere una copia autorizada y una ventana acordada.

## Límites conocidos

Una bodega, cuatro zonas sin capacidad, un modelo de unidad por lote, máximo 30 líneas por operación.
No se implementan pedidos públicos, notificaciones externas, contabilidad, cálculo de personas únicas,
exportación de informes ni gestión de congelados. Las consultas de informes tienen límites explícitos
y no reconstruyen estados pasados de cierre. Los historiales incrustados son adecuados para el volumen
del prototipo; su crecimiento sostenido requeriría revisar el diseño.

El prototipo no acredita procedimientos internos reales del BAB. El alcance académico y esa limitación
se mantienen en el perfil y en el diseño de datos.
