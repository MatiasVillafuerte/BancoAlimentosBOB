# Contrato aprobado para la aplicación BAB

Actualizado el 26 de noviembre de 2026. Este contrato reúne las reglas aceptadas por Matias. Ya están implementados el inicio y cierre de sesión, consulta de sesión, cambio de contraseña, cuenta personal, contadores documentales, listas de donaciones/entregas/alertas y fichas de operaciones. Las escrituras operativas y el manejo de archivos siguen pendientes. Los HTML son referencias visuales; el seed y los JSON conservan la versión anterior para probar y respaldar la migración.

La aplicación utiliza Next.js con React y TypeScript dentro de BancoAlimentos_Proyectos. El servidor accede a MongoDB; las credenciales de Atlas nunca llegan al navegador. Se mantienen ocho colecciones de negocio y GridFS. El acceso está documentado en [la guía de desarrollo](04-desarrollo-y-git.md).

## Estados y efectos sobre el inventario

Las sugerencias FEFO se calculan a partir de lotes aptos y cantidades libres. No son entregas almacenadas ni generan reservas. El usuario elige organización, fecha y cantidades.

| Operación y estado | Significado | Efecto físico |
| --- | --- | --- |
| Entrega programada | Fecha, destino y cantidades definidos; reservas activas. | Ninguno; aumenta lo reservado. |
| Donación por_documentar | Los productos ya se recibieron; falta la foto obligatoria u otro dato documental necesario. | La recepción ya aumentó existencias. |
| Entrega por_documentar | Se registró la entrega real, pero falta documentación. | La salida ya descontó existencias y consumió o liberó las reservas. |
| Donación recibida | Datos y al menos una foto completos, pendiente de revisión administrativa. | Ninguno adicional. |
| Entrega entregada | Datos y al menos una foto completos, pendiente de revisión administrativa. | Ninguno adicional. |
| Donación o entrega observada | El administrador solicita una corrección con un motivo concreto. | Ninguno por cambiar el estado. |
| Donación o entrega completada | El administrador validó la información y las evidencias de esa versión. | Ninguno adicional. |
| Entrega cancelada | Se cancela antes de realizarse y se conserva el expediente. | Libera reservas, no resta existencias. |

Una operación con evidencia desde el comienzo puede pasar directamente a recibida o entregada al registrarse físicamente. Subir archivos antes de que ocurra una entrega no confirma una salida.

El circuito de corrección es observada → corregir y reenviar → recibida/entregada → nueva revisión → completada. No se aprueba automáticamente una corrección. Las operaciones completadas requieren reapertura administrativa con motivo para cambiar sus datos o evidencias; la aprobación previa se conserva en el historial.

Una entrega ya realizada nunca vuelve a programada ni se cancela para recuperar stock. Una devolución real produce un movimiento nuevo. Un error de cantidades se corrige mediante un movimiento compensatorio, con el original, el motivo y su responsable; se muestran el valor registrado y su corrección.

## Autoría y revisión

Al crear una donación o entrega, el servidor asigna registradaPor desde la sesión verificada y registradaEn con la hora del servidor. No acepta el autor enviado por el navegador. Cada nueva acción registra el usuario que la hizo; el autor inicial nunca se reemplaza por quien revisa o modifica.

Al confirmar una entrega, entregadaPor identifica la cuenta que confirma la operación. Puede diferir de quien la programó. Si hace falta identificar a otra persona que participó físicamente, se documenta aparte sin alterar la autoría de la cuenta.

| Campo común | Uso |
| --- | --- |
| estado | Situación operativa y documental descrita arriba. |
| registradaPor / registradaEn | Autor inicial y momento del registro. |
| versionDatos | Versión del contenido que se somete a revisión. Aumenta al cambiar datos o evidencias. |
| historial[] | Eventos con accion, usuarioId, fecha, detalle y versión cuando corresponda. |
| revision.revisadaPor / revisadaEn | Administrador y momento de su decisión. |
| revision.rolAlRevisar | Rol administrador que tenía al decidir; conserva el contexto aunque después cambie de rol. |
| revision.versionRevisada | Versión revisada; debe coincidir con versionDatos al completar. |
| revision.observacion | Motivo obligatorio cuando se solicita una corrección. |

La revisión final corresponde al rol administrador. El backend comprueba sesión activa, rol y versión actual en cada solicitud. Un cambio concurrente del expediente impide aprobar una versión que el administrador no vio. Una contraseña con hash no sustituye estas comprobaciones.

En los datos históricos no se inventa el autor del registro a partir del nombre de quien entregó. La migración conserva los responsables conocidos y marca el origen migrado. La interfaz mostrará “Autor de registro no confirmado” cuando corresponda.

## Alertas y ficha de información

Al entrar, el administrador verá tres grupos con contadores y acceso a Información:

- Falta documentación: operaciones por_documentar.
- Pendientes de revisión: donaciones recibidas y entregas entregadas.
- Observadas: operaciones que necesitan corrección.

La ficha muestra código, fechas, donante u organización, convenio si aplica, productos, cantidades, lotes, zona, observaciones, evidencias, autor, responsable de la entrega, revisiones e historial. El perfil del autor muestra nombre, correo, teléfono, rol y estado. Nunca devuelve passwordHash.

Las acciones administrativas son Validar y completar y Solicitar corrección; esta última exige un motivo. El responsable ve la observación y una tarea pendiente en su panel. Los datos de contacto permiten que el administrador lo contacte por su cuenta; no se envían correos o mensajes automáticamente.

Las alertas se consultan desde las operaciones, sin otra colección de notificaciones. Se mantienen hasta resolver la condición; leer una alerta no completa la operación.

## Inventario y reservas

La cantidadEnBodega representa existencias físicas; cantidadReservada es la suma de reservas activas por lote. Lo libre se calcula restando ambas, y solo se ofrece para nuevas entregas si el lote es apto. Vencidos, descartados y agotados no se ofrecen.

Las líneas de una entrega conservan cantidadProgramada, cantidadReservada y cantidadEntregada, además de loteId y unidad. CantidadProgramada puede faltar en entregas históricas realizadas cuyo plan original se desconoce. En nuevas entregas programadas es obligatoria.

Programar, aumentar o reducir una reserva comprueba y actualiza el lote y la entrega en una transacción con condición de saldo suficiente. Se unifica una línea por lote. No basta con leer un saldo y escribir después: dos usuarios no pueden reservar las mismas existencias.

Confirmar la salida registra las cantidades reales, crea un movimiento por lote, resta cantidadEnBodega y consume/libera la reserva en la misma transacción. Si se reservaron 100 y se entregaron 80, salen 80 y se libera el remanente. Lo que siga comprometido se programa en otra entrega.

La fechaProgramada se conserva separada de fechaEntrega. Se comprueba la aptitud del lote al reservar y al entregar, incluida su fecha de vencimiento. Las entregas atrasadas se señalan sin cancelar reservas automáticamente.

Una merma sobre un lote reservado no se oculta: se registra la pérdida y se ajustan las reservas afectadas de forma coordinada. Las entregas incompletamente reservadas requieren reasignación. El coordinador decide qué compromisos modificar, sin permitir reservas superiores al stock físico.

Las reservas no son movimientos físicos de inventario. El saldo físico se concilia con recepciones, salidas, devoluciones, mermas y ajustes. La idempotencia usa una clave estable por solicitud y claves derivadas por lote; confirmar, reintentar o aprobar nunca vuelve a descontar.

Durante la transición se conserva cantidadDisponible como alias del saldo físico y cualquier escritura de stock debe actualizarlo junto a cantidadEnBodega. El validador exige que coincidan mientras exista el alias. Su eliminación será una migración posterior. La ubicación antigua se conserva como dato legado, pero la interfaz nueva utiliza zona.

## Evidencias y convenios

Cada operación tiene varios archivos propios. Se exige al menos una foto de la recepción para presentar una donación a revisión y al menos una foto de la entrega para presentar una entrega. Actas, facturas y otros PDF son opcionales cuando no existen.

El servidor comprueba que la foto está cargada, que realmente es una imagen admitida, que pertenece a esa operación y que el usuario puede acceder a ella. La existencia de un identificador en archivos no basta. Una foto de recepción no completa la evidencia de una entrega.

GridFS conserva metadata con entidad (“donaciones”, “entregas”, “convenios” u “organizaciones”), entidadId, tipo, subidoPor y descripción opcional. La relación es una operación a varios archivos. Un loteId opcional permite indicar qué lote muestra una foto de recepción. El tipo MIME se guarda en metadata.

Los archivos se cargan fuera de la transacción de stock. Después se vinculan sus identificadores. Los fallos de carga o de aprobación no repiten movimientos. La limpieza elimina mediante GridFS únicamente archivos temporales sin referencias comprobadas.

Un aporte ocasional conserva donante, recepción y lotes sin exigir convenioId, NIT ni PDF contractual. El contacto puede omitirse cuando no se dispone de él. Ser persona o empresa no determina por sí solo si una recepción tiene convenio.

Si se referencia un convenio, debe pertenecer al donante y ser aplicable a la fecha de recepción. Las versiones son inmutables. Los PDF pendientes de los ejemplos no se sustituyen por identificadores ficticios; un expediente contractual definitivo debe tener su archivo original.

## Zonas e informes

Se muestran cuatro filtros: Z1 Secos, Z2 Panificados, Z3 Refrigerados y Z4 No alimentos. No se muestran estantes, capacidades ni ocupaciones inventadas. La conservación se mantiene independiente. Los congelados quedan fuera de esta versión hasta definir una zona apta.

Los indicadores operativos se calculan con recepciones y salidas reales, aunque estén por documentar o revisar. No deben filtrar únicamente estado entregada: eso excluiría completadas y por_documentar que ya afectaron el stock. Los informes administrativos pueden filtrar expedientes completados y mostrar pendientes por separado.

No se suman cajas, bolsas y kilos como una sola unidad. Sin peso medido, se muestra sin registro. La suma de beneficiariosAtendidos representa atenciones, no personas únicas.

## Rutas previstas

Las rutas requieren sesión y permisos salvo el inicio de sesión.

Ya están disponibles `GET /api/alertas`, `GET /api/donaciones`, `GET /api/entregas` y
`GET /api/donaciones/:id`, `GET /api/entregas/:id`, además del acceso y el panel.
Las listas reciben `q` (hasta 80 caracteres), `pagina` (1 a 1000) y `estado`; las alertas usan
`grupo` (`por_documentar`, `por_revisar`, `observada`) en lugar de `estado`.
Devuelven 20 registros por página. Filtros inválidos devuelven 400; sin sesión, 401; una ficha
inexistente o ajena a los permisos devuelve 404. Las respuestas usan `Cache-Control: no-store`.
Las fichas devuelven campos públicos explícitos; nunca documentos completos de `voluntarios`.
La etapa 3 incorpora las altas de donantes, organizaciones, convenios y cuentas; edición de catálogos
y cuentas; y recepción de donaciones con sus lotes y movimientos. Los permisos y cuerpos de estas
solicitudes se detallan en [la guía de registros](06-registros-y-catalogos.md). Las otras escrituras
de la tabla pertenecen a las etapas 4 y 5.

| Ruta | Responsabilidad |
| --- | --- |
| POST /api/login, POST /api/logout | Autenticar mediante Argon2id y gestionar sesión. |
| GET /api/panel | Indicadores y pendientes según rol. |
| GET /api/alertas | Faltas documentales, revisión pendiente y observaciones visibles para la cuenta. |
| GET/POST /api/donantes, GET/PATCH /api/donantes/:id | Consultar, registrar y editar donantes, incluido registro abreviado. |
| GET/POST /api/convenios, GET /api/convenios/:id | Consultar y crear una versión nueva; el PDF se vincula en etapa 5. |
| GET/POST /api/donaciones | Consultar o registrar recepción real, lotes y movimientos una vez. |
| GET /api/donaciones/:id | Expediente y proyección segura de sus responsables. |
| GET /api/lotes, GET /api/lotes/:id | Inventario, reservas, zona, vencimiento e historial. |
| GET /api/sugerencias-fefo | Prioridades calculadas sin crear entregas ni reservas. |
| GET/POST /api/entregas | Consultar o programar una entrega con reservas. |
| PATCH /api/entregas/:id | Cambiar una programación y recalcular reservas. |
| POST /api/entregas/:id/confirmar | Registrar salida física una sola vez; estado documental según evidencia. |
| POST /api/entregas/:id/cancelar | Cancelar antes de la salida y liberar reservas. |
| GET /api/entregas/:id | Expediente con autor, responsable, documentos e historial. |
| POST /api/donaciones/:id/reenviar, POST /api/entregas/:id/reenviar | Comprobar documentación y presentar la versión corregida a revisión. |
| POST /api/donaciones/:id/revision, POST /api/entregas/:id/revision | Solo administrador: aprobar o observar la versión que leyó. |
| POST /api/donaciones/:id/reabrir, POST /api/entregas/:id/reabrir | Solo administrador: reabrir un expediente completado con motivo. |
| GET/POST /api/movimientos | Historial y operaciones de merma, devolución o ajuste autorizadas. |
| GET/POST /api/organizaciones, GET/PATCH /api/organizaciones/:id | Instituciones receptoras. |
| GET /api/trazabilidad/:codigoEntrega | Todas las líneas hasta sus recepciones y convenios opcionales. |
| GET/POST /api/archivos, GET /api/archivos/:id | Cargar, consultar y descargar con permisos. |
| GET /api/informes/:tipo | Informes calculados; distinguir hechos físicos y aprobación administrativa. |
| GET/POST /api/usuarios, GET/PATCH /api/usuarios/:id | Administración de cuentas; jamás devolver hashes. |

## Validación pendiente en la implementación

La migración prepara datos, índices y validadores. La web incorpora sesiones, contadores, listas,
fichas, catálogos, cuentas y recepción real. Las consultas verifican autoría, filtros, campos privados,
referencias de archivos y conservación de datos históricos. La etapa 3 prueba recepción concurrente
sin duplicados, reversión ante fallo, convenios y permisos con transacciones reales en una base temporal.
Quedan para las etapas siguientes concurrencia de reservas, subida fallida, cambio de versión durante
revisión, rechazo y reenvío, cancelación y entrega parcial. La autenticación prueba cierre y vencimiento
de sesiones, cuentas desactivadas, cambios de rol, limitación de intentos y exclusión de campos privados.

Fuentes técnicas: [autenticación en Next.js](https://nextjs.org/docs/app/guides/authentication), [transacciones de MongoDB](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/), [GridFS](https://www.mongodb.com/docs/manual/core/gridfs/) y [almacenamiento de contraseñas de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
