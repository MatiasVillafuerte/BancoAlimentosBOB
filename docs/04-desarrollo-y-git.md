# Desarrollo acceso y Git

Actualizado el 26 de noviembre de 2026.

## Lo que cambió

El proyecto base se publicó en `main` antes de crear `feat/backend-auth`. Next.js contiene tanto
la interfaz React como el backend; no hay que iniciar otro servidor en `backend`.
Las maquetas de `frontend` se conservan para orientar las pantallas siguientes.

Esta etapa implementa login, logout, consulta de sesión, cambio de contraseña, cuenta personal
y contadores documentales reales. Las fichas y acciones operativas siguen pendientes.

## Abrir el proyecto actual

En la terminal de VS Code o PowerShell:

```powershell
Set-Location -LiteralPath 'C:\Users\matia\Documents\ChatGPT\Proyecto de BD - Banco de Amilentos\BancoAlimentos_Proyectos'
git branch --show-current
npm run dev
```

La rama debe ser `feat/backend-auth`. Abre http://localhost:3000. También se admite
http://127.0.0.1:3000, la dirección que muestra Next.js en la terminal. Cuando `APP_URL` apunta al
equipo local, ambas direcciones son válidas con el mismo protocolo y puerto configurados.
En un despliegue público se exige exactamente el origen de `APP_URL`. Detén el servidor con Ctrl+C.

Compass y la aplicación se conectan a Atlas por separado; no hace falta abrir Compass para iniciar
sesión. Si aparece **Origen de solicitud no permitido**, revisa la dirección del navegador:
no debe tener otro puerto (por ejemplo, 3001). Si 3000 está ocupado, detén el servidor anterior
antes de volver a ejecutar `npm run dev`.

En otro equipo, descarga la rama e instala las versiones fijadas:

```powershell
git clone https://github.com/MatiasVillafuerte/BancoAlimentosBOB.git
Set-Location BancoAlimentosBOB
git switch feat/backend-auth
npm ci
Copy-Item .env.example .env.local
```

Completa `.env.local` localmente. Si ya existe, conserva sus valores. No compartas sus credenciales.

| Variable | Uso |
| --- | --- |
| `MONGODB_URI` | Conexión privada de Atlas, utilizada solo por el servidor. |
| `MONGODB_DB` | Debe ser `bab_donaciones`. |
| `APP_URL` | `http://localhost:3000` en desarrollo; URL HTTPS real en un despliegue. |

En este entorno la consulta DNS SRV de Node fallaba de forma intermitente. Por eso `.env.local`
usa la conexión estándar `mongodb://` del mismo clúster, con sus tres servidores, conjunto de réplicas,
origen de autenticación y `tls=true`. Se verificó con los datos de Atlas; no se cambió la red de Windows.
La conexión previa `mongodb+srv://` se conserva en el `.env` local de `backend`.
En otros equipos puedes usar la conexión SRV que proporciona Atlas si resuelve correctamente.
Si cambian los servidores del clúster, actualiza la conexión estándar desde Atlas.

## Administradora inicial

El correo seleccionado es **admin.demo@example.com**. La contraseña inicial se consulta en
`.runtime/admin-inicial.json`, solo en tu equipo; no está en GitHub.

1. Abre el archivo en tu editor y copia el valor de `password`.
2. Inicia sesión con el correo indicado.
3. En **Mi cuenta**, cambia la contraseña por una propia de 15 a 128 caracteres.
4. Elimina el archivo local inicial; después del cambio su contraseña ya no servirá.

Para preparar por primera vez otra copia autorizada de la base:

```powershell
npm run admin:init
```

El comando verifica la cuenta existente y amplía el validador de `voluntarios` conservando las reglas
V2. Respalda el validador anterior en `.runtime/validador-voluntarios-anterior.ejson`.
Solo crea el hash cuando la cuenta no lo tiene. Repetirlo no restablece la contraseña ni destruye sesiones.
Necesita lectura, escritura y `collMod` en `bab_donaciones`; el uso cotidiano no necesita `collMod`.
Las otras cuatro cuentas seguirán sin acceso hasta establecer sus contraseñas individualmente.

No ejecutes `db/seed.js` ni vuelvas a aplicar la migración V2 para establecer contraseñas.

## Cambios de autenticación en voluntarios

- `passwordHash`: Argon2id con 19 MiB de memoria, dos iteraciones y paralelismo uno.
- `passwordActualizadaEn`: momento del alta o cambio.
- `sesiones[]`: hasta cinco objetos con `tokenHash`, `creadaEn` y `expiraEn`.
- `acceso`: `intentos` y `ventanaDesde`, actualizado atómicamente.
- `ultimoAccesoEn`: último login correcto.

La cookie `bab_session` contiene el identificador de cuenta y un token aleatorio de 32 bytes.
MongoDB guarda únicamente su huella SHA-256. Cada sesión vence a las ocho horas, sin renovación
automática. Cada solicitud comprueba cuenta activa, rol y vencimiento. Cerrar sesión revoca su token;
cambiar contraseña revoca todos los anteriores y emite uno nuevo para la sesión actual.

Se limitan a cinco las verificaciones por cuenta en quince minutos. Una verificación correcta reinicia
el contador. El límite también se aplica al comprobar la contraseña actual para cambiarla.
Los errores de login no revelan si existe un correo. Los hashes no aparecen en las respuestas.

Las solicitudes que modifican el acceso comprueban `Origin` y limitan JSON a 8 KiB. La cookie es
HttpOnly, SameSite=Lax y Secure con HTTPS. No se guardan credenciales ni tokens en localStorage.
Para un despliegue público se necesitan dominio HTTPS, variables privadas, permisos de Atlas y límites
de tráfico del alojamiento. Subir código a GitHub no publica por sí solo la página web.

## API implementada

| Ruta | Resultado |
| --- | --- |
| `POST /api/login` | Valida `{email, password}` y establece la cookie. |
| `POST /api/logout` | Revoca la sesión y borra la cookie. |
| `GET /api/sesion` | Devuelve la cuenta pública o 401. |
| `POST /api/cuenta/password` | Comprueba `passwordActual`, `passwordNueva` y `confirmacion`; rota las sesiones. |
| `GET /api/panel` | Totales y pendientes según la cuenta autenticada. |

`por_documentar` no significa que los productos sigan físicamente en bodega. El panel cuenta expedientes;
no modifica stock ni reservas. Los roles no administrativos ven registros con `registradaPor` igual a su cuenta.

## Verificaciones

```powershell
npm test
npm run lint
npm run typecheck
npm run build
```

Las pruebas de autenticación usan un almacén de prueba en memoria; las de migración utilizan datos
y conexiones simuladas. No alteran Atlas. Las próximas rutas de inventario necesitarán pruebas propias
de transacciones, concurrencia, entregas parciales y reintentos antes de habilitar sus escrituras.

## Hacer un commit en esta rama

Estos pasos son para cambios posteriores. El proyecto base y el primer avance tienen commits separados.

```powershell
git switch feat/backend-auth
git pull --ff-only
git status
git diff
```

Añade los archivos concretos que hayas cambiado. Por ejemplo:

```powershell
git add src scripts tests db/esquema-autenticacion.cjs docs README.md backend/README.md .env.example package.json package-lock.json next.config.ts next-env.d.ts tsconfig.json eslint.config.mjs AGENTS.md
git diff --cached --stat
git diff --cached
git commit -m "feat: describir el cambio realizado"
git push origin feat/backend-auth
```

No añadas `.env.local`, `backend/.env`, `.runtime`, `db/respaldos`, `node_modules` ni `.next`.
Comprueba sus exclusiones:

```powershell
git check-ignore .env.local .runtime/admin-inicial.json backend/.env
```

`commit` guarda una versión local; `push` la sube a GitHub. `main` conserva el punto de partida.
Cuando quieran integrar el avance, revisen un Pull Request de `feat/backend-auth` hacia `main`.
No hace falta fusionarlo para compartir o seguir trabajando en esta rama.

El Word principal de diseño está un nivel por encima del repositorio: `3_Diseno_BD_corregido.docx`.
Se actualizó en ese archivo. No se añade automáticamente al hacer un commit dentro de
`BancoAlimentos_Proyectos`.
