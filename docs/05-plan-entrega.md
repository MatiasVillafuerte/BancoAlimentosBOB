# Plan de entrega del proyecto BAB

Actualizado el 27 de noviembre de 2026.

El proyecto se entrega por recorridos que se pueden ejecutar en la aplicación. Cada etapa reúne
interfaz, backend, permisos, pruebas y documentación. La base migrada y las reglas aprobadas en
[el contrato funcional](02-contrato-api.md) son el punto de partida. No se simulan acciones terminadas
con botones que todavía no guardan o consultan datos reales.

## Etapas y criterios de cierre

| Etapa | Estado | Resultado para el usuario | Cómo se comprueba |
| --- | --- | --- | --- |
| 1. Acceso y cuentas | Terminada | Iniciar sesión, consultar la cuenta, cambiar contraseña y salir. | Hash Argon2id, sesiones revocables, cuenta activa, limitación de intentos y pruebas desde el navegador. |
| 2. Consulta de operaciones | Terminada | Abrir pendientes desde el panel; buscar donaciones y entregas; consultar lotes, convenios, responsables, revisión e historial. | Consultas reales a Atlas, filtros y paginación, acceso por autoría, exclusión de campos privados y conservación de los registros históricos. |
| 3. Registro y catálogos | Terminada | Administrar donantes y organizaciones; registrar una recepción con sus lotes; asociar una versión de convenio cuando corresponda; habilitar otras cuentas según rol. | Donante ocasional sin NIT ni contrato obligatorio; autor automático; recepción y movimientos atómicos; reintento sin duplicar; datos y versión del convenio correctos. |
| 4. Inventario y distribución | Terminada | Consultar las cuatro zonas; sugerir lotes por FEFO; programar, modificar, cancelar y confirmar entregas; registrar mermas y devoluciones. | Reservas concurrentes, saldo suficiente, lote apto, entrega parcial, liberación de remanentes y movimientos compensatorios con trazabilidad. |
| 5. Evidencias y revisión | Terminada | Subir, consultar y descargar fotografías y PDF, incluidos los convenios; reenviar correcciones; validar o solicitar cambios como administrador. | Archivo propio y tipo real admitido; fotografía mínima; revisión de la versión vigente; rechazo, reenvío y reapertura; cambios documentales sin repetir movimientos físicos. |
| 6. Integración y entrega final | Terminada | Recorrer una donación completa hasta su distribución e informe; instalar y presentar el prototipo con documentación coherente. | Pruebas integrales, permisos por rol, interfaz móvil, datos ficticios de demostración, manuales, instrucciones de instalación y revisión del modelo final. |

La administración completa de usuarios de la etapa 3 amplía la cuenta inicial de la etapa 1.
Los datos de convenios se incorporan en la etapa 3 y su manejo de PDF se integra en la etapa 5.
La consulta de archivos de la etapa 2 muestra solamente metadatos; carga, descarga y previsualización
pertenecen a la etapa 5.

## Avance de la etapa 2

- Nuevas pantallas: `/donaciones`, `/entregas`, `/alertas` y sus fichas de información.
- Los contadores y las filas de seguimiento del panel abren listas filtradas.
- Búsqueda literal por código y nombre del donante u organización, estados válidos y páginas de 20 registros.
- Administración consulta todas las operaciones. Las recepciones de otros roles se limitan a su autoría.
  Desde la etapa 4, coordinación gestiona todas las entregas; voluntariado consulta las propias,
  asignadas o que realizó. Las listas, fichas y contadores aplican el mismo alcance.
- Las entregas históricas sin autor confirmado conservan a su responsable conocido por separado;
  no se inventa quién creó el registro. Sus permisos de consulta siguen el alcance anterior.
- Las fechas se presentan en la zona horaria de Bolivia. Un peso o una cantidad programada desconocidos
  se muestran como **Sin registro**, y un cero conocido se conserva como cero.
- Las programaciones históricas conservan campos legados de beneficiarios y peso. Mientras no exista
  `fechaEntrega`, esos valores no se presentan como atenciones ni kilos ya entregados.
- La ficha diferencia cantidad recibida, saldo físico, reserva y cantidad libre. No suma unidades incompatibles.
- El convenio se busca por identificador y donante. Los metadatos de archivos requieren vínculo con la
  operación y coincidencia de entidad e identificador; una referencia ajena no revela el nombre del archivo.
- Ninguna consulta modifica las colecciones, aprueba expedientes o cambia existencias. No se requiere
  ejecutar una nueva migración en Compass o mongosh para utilizar esta etapa.

## Avance de la etapa 3

- Pantallas de catálogos, recepción y equipo; formularios conectados con validación en servidor.
- Recepción con 1–30 lotes: cantidad, unidad, zona, conservación, vencimiento y peso opcional.
- Donación, lotes y movimientos se confirman en una transacción. Los reintentos de la misma solicitud
  no duplican registros; una clave reutilizada con otros datos devuelve conflicto.
- Convenios con versiones conservadas, vigencia y selección por donante y fecha de recepción.
- Administración de cuentas, contraseña inicial solo si no existe y revocación de sesiones al cambiar
  rol o desactivar. No se sobrescribió la contraseña de la administradora del prototipo.
- Edición de catálogos con control de versión y auditoría; desactivación sin borrar el historial.
- Comprobación de escritorio y móvil. Pruebas de transacciones reales en una base temporal aislada,
  retirada al terminar; los datos de demostración de `bab_donaciones` se conservaron.
- No hace falta ejecutar otra migración. Los PDF, fotografías y aprobación se mantienen en etapa 5.

Uso, permisos, API y campos técnicos: [guía de registros y catálogos](06-registros-y-catalogos.md).

## Avance de la etapa 4

- Inventario por zona, estado, producto y vencimiento; FEFO con fecha prevista, sin crear reservas
  hasta guardar la programación. Los lotes sin vencimiento registrado se identifican y quedan al final.
- Programación con organización y responsable activos; modificación con motivo, cancelación y
  confirmación real parcial. Las reservas se actualizan dentro de la misma transacción.
- Los saldos distinguen físico, reservado y libre. Confirmar descuenta una vez y libera el sobrante.
  No convierte automáticamente la entrega en completada: queda por documentar.
- Mermas con reducción explícita de reservas afectadas; la entrega requiere reasignación antes de
  confirmarse. Devoluciones vinculadas al origen y control acumulado de cantidades.
- Ajustes reservados a administración, con original conservado y trazabilidad. Una corrección cambia
  la versión documental; un expediente completado exige reapertura antes de corregir cantidades.
- 59 pruebas locales y 25 escenarios de integración (15 de inventario y 10 de registros) aprobados.
  Compilación, TypeScript y ESLint correctos; 30 comprobaciones HTTP de sesión y origen.
- 75 comprobaciones de lectura sobre los datos actuales: ocho lotes conciliados y datos de negocio
  conservados. Revisión visual del inventario y sus sugerencias FEFO en escritorio.
- Sin nueva migración ni modificación de contraseñas. Las bases temporales de pruebas se retiraron.

Uso, ejemplos, límites y campos añadidos: [guía de inventario y entregas](07-inventario-y-entregas.md).
## Avance de la etapa 5

- Carga de JPEG, PNG, WebP y PDF originales en GridFS, con contenido validado, permisos y descarga
  privada. Varias evidencias por operación y foto de lote opcional en recepciones.
- Página del convenio con sus condiciones y un PDF original por versión, sin reemplazar contratos anteriores.
- Envío explícito a revisión; aprobación u observación solo administrativa; corrección y reenvío;
  reapertura con motivo y conservación de la revisión anterior en el historial.
- Retiro de evidencias con motivo y archivo conservado. Limpieza explícita de temporales propios
  sin referencias actuales ni históricas; revisión de candidatos sin escrituras por defecto.
- 67 pruebas locales y 39 escenarios de integración aprobados: 14 de documentos, 15 de inventario
  y 10 de registros. Compilación, TypeScript y ESLint correctos.
- 46 comprobaciones HTTP de sesión y origen. Lectura de 36 fichas documentales según permisos,
  con huella de datos antes/después sin cambios y sin archivos ficticios en la base del proyecto.
- Revisión en navegador de la ficha de donación, formulario de evidencias, bloqueo de envío sin foto,
  corrección descriptiva y página del convenio. El flujo de escritura y los conflictos se verificaron
  con datos aislados mediante integración; la revisión móvil integral continúa en la etapa 6.
- Sin nueva migración ni cambio de contraseñas. Las bases de prueba se retiraron.

Uso, API, campos y límites: [guía de evidencias y revisión](08-evidencias-y-revision.md).
## Avance de la etapa 6

- Informes por período inclusivo en Bolivia: operaciones físicas, aprobación vigente, cobertura de peso
  y atenciones, cantidades originales, corregidas, devueltas y netas por producto y unidad.
- Trazabilidad desde cada entrega hasta sus lotes, recepciones y convenio opcional; las referencias
  no permiten consultar expedientes ajenos a los permisos de la cuenta.
- Recorrido completo con servicios reales, validadores, transacciones y GridFS: recepción de 200 bolsas,
  reserva de 100, rechazo de 120 adicionales, salida parcial de 80 y devolución posterior de 10.
- 71 pruebas locales y 43 escenarios de integración aprobados. Compilación, TypeScript y ESLint correctos.
  La suite de integración informa 47 pruebas al incluir sus cuatro contenedores de escenarios.
- 14 consultas de informes/trazabilidad según cuenta y dos rutas sin sesión verificadas. Huella de datos
  de negocio conservada antes/después; sin migraciones, reinicio de contraseñas ni aprobaciones ficticias.
- Revisión visual en escritorio y móvil de informes, trazabilidad y acceso a evidencia. Las escrituras
  completas se comprobaron en integración sobre bases temporales, retiradas al terminar.
- Manuales de usuario y técnico, guion de demostración, diccionario y diagrama editable.
  Word principal actualizado en su mismo archivo, con copia sincronizada dentro del repositorio.
- El perfil académico conserva la hipótesis y sus límites. No se presenta el prototipo como prueba
  de una falla real de organización del BAB.

Resultado, pruebas y límites: [verificación final](13-verificacion-final.md).
Las seis etapas del prototipo están completas. El alojamiento público y la fusión hacia `main`
son decisiones posteriores; el código de la entrega permanece en la rama de desarrollo.

## Forma de trabajo y Git

1. Leer las reglas aprobadas y contrastarlas con el modelo y los datos actuales.
2. Definir un recorrido completo y los resultados que debe producir.
3. Implementar validación y permisos junto con las consultas o transacciones del backend.
4. Conectar las pantallas a esas funciones, incluyendo casos vacíos, errores y datos históricos incompletos.
5. Probar los casos críticos del recorrido; revisar la navegación y la presentación.
6. Actualizar el contrato, el estado de este plan y las instrucciones de uso.
7. Guardar un commit descriptivo y publicar el avance en la rama de desarrollo.

`main` conserva el proyecto base. Los avances actuales están en `feat/backend-auth`; pese al nombre,
esta rama contiene la integración de la aplicación en curso. Los commits separan cada avance.
La integración final hacia `main` se revisará mediante un Pull Request. No se fusiona automáticamente
al terminar una etapa.

## Contenido de la entrega final

| Entregable | Contenido de la entrega |
| --- | --- |
| Aplicación | Frontend React y backend Next.js, con MongoDB Atlas y archivos en GridFS. |
| Modelo de datos | Word de diseño actualizado, diccionario de campos, relaciones y diagrama editable coherentes con la implementación. |
| Perfil académico | Problema hipotético y limitaciones de la información disponible sobre BAB; objetivos y alcance alineados con el sistema realmente construido. |
| Manual de usuario | Guía de acceso, recepción, inventario, entrega, evidencia y revisión administrativa con ejemplos. |
| Manual técnico | Instalación, variables privadas, estructura del código, API, permisos, respaldo y recuperación. |
| Pruebas y demostración | Resultados de pruebas y un recorrido reproducible con datos ficticios, sin publicar credenciales ni respaldos privados. |
| Repositorio | Historial de commits, instrucciones de ejecución y versión final identificable. |

Publicar el repositorio en GitHub no aloja la aplicación web. Un despliegue en Internet se prepara
por separado con URL HTTPS, variables privadas y configuración de Atlas del entorno elegido.

## Recorrido de aceptación final

Un usuario inicia sesión, registra una donación ocasional y sus lotes, adjunta evidencias y presenta
el expediente. El administrador puede solicitar una corrección y luego aprobar la versión corregida.
Después se programa una entrega que reserva cantidades, se impide una segunda reserva que exceda
el saldo libre y se confirma una entrega parcial. La cantidad realmente entregada descuenta existencias
una sola vez; la parte no utilizada de la reserva se libera. Se documenta y valida la entrega, y se consulta
su trazabilidad hasta la donación y su convenio opcional.

El informe distingue operaciones físicas de expedientes aprobados, y conserva separados los kilos,
las unidades y las atenciones. Completar este recorrido, sus errores previstos y la documentación
marca el cierre del prototipo.
