# Actualizar la base BAB sin borrar colecciones

Esta guía corresponde al modelo aprobado el 24 de noviembre de 2026. La base ya está cargada. No vuelvas a ejecutar db/seed.js sobre ella: ese archivo borra y recrea las colecciones.

La migración preparada tiene tres modos: revisar, aplicar y revertir. El modo predeterminado es revisar y no escribe en MongoDB. Los scripts solo seleccionan bab_donaciones; no acceden a SeguimientoGrado.

Estado al 25 de noviembre de 2026: migración aplicada y verificada en Atlas. La revisión posterior terminó con ok: true, errores: 0, documentosPorActualizar: 0 e indicesPorCrear: 0. Se conservan las ocho colecciones y los 49 documentos. No quedan pasos de migración pendientes; las instrucciones de abajo se conservan como procedimiento y referencia de recuperación.

## Qué incorpora

- Estados documentales de donaciones y entregas, revisión administrativa, historial y versión del contenido.
- Existencias físicas, reservas por lote y cantidades planificadas frente a entregadas.
- Cuatro zonas sin estantes ni capacidades inventadas.
- Validadores de documentos e índices de unicidad y consulta.
- Las dos reparaciones concretas de los datos ficticios: convenio de DON-2026-0015 y origen de la devolución de 2 bolsas.
- Campos para autoría automática de los registros nuevos, sin inventar autores históricos.
- Compatibilidad temporal con campos anteriores y respaldo para reversión.

Las cuentas de ejemplo siguen sin contraseña. La migración no crea una contraseña predeterminada, no genera hashes vacíos y no aprueba expedientes. El backend asignará los hashes Argon2id al crear o inicializar las cuentas.

## Antes de ejecutar

Esta migración requiere MongoDB Shell (mongosh) independiente. La consola integrada de Compass utilizada en este proyecto devuelve COMMON-90002 al llamar a load(); por eso no sirve para cargar estos archivos locales. Compass se puede seguir usando para consultar las colecciones.

1. Instala MongoDB Shell desde [la descarga oficial](https://www.mongodb.com/try/download/shell), seleccionando el instalador MSI de Windows compatible con tu equipo. Es la herramienta mongosh.
2. Abre una ventana nueva de PowerShell y comprueba la instalación con el comando de abajo. Si Windows no reconoce mongosh, revisa [la instalación y el PATH](https://www.mongodb.com/docs/mongodb-shell/install/) antes de continuar.

~~~powershell
mongosh --version
~~~

3. En Atlas, abre Cluster0 → Connect → Shell. Copia el comando de conexión que muestra Atlas y ejecútalo en PowerShell. Introduce la contraseña del usuario de la base de datos cuando mongosh la solicite; no es la contraseña de acceso a la página de Atlas. No compartas la contraseña ni una URI que la contenga.
4. Una vez conectado, el indicador cambia de PS ...> al de mongosh, normalmente Atlas ... [primary] ...>. Los bloques JavaScript de esta guía se pegan dentro de esa sesión de mongosh. No se ejecutan directamente en PowerShell ni en la consola integrada de Compass.
5. Comprueba que ves bab_donaciones y sus ocho colecciones. Mantén pausada cualquier carga de datos o aplicación que escriba durante la migración.
6. Para revisar basta con lectura de los datos y metadatos. Para aplicar, la cuenta de MongoDB también necesita escritura sobre bab_donaciones y permiso para modificar validadores e índices. Si falta collMod, un administrador de Atlas deberá otorgar el permiso apropiado sobre esta base, por ejemplo dbAdmin además de readWrite. No hace falta acceso global a otras bases.
7. Usa la ruta de BancoAlimentos_Proyectos indicada abajo. Si moviste la carpeta, actualiza únicamente BAB_RUTA.

Los pasos de conexión siguen [la guía oficial de Atlas para mongosh](https://www.mongodb.com/docs/atlas/mongo-shell-connection/).

La migración está preparada para el prototipo y limita la lectura a 10000 documentos por colección de negocio. Conserva los archivos GridFS; solo lee sus metadatos para comprobar relaciones. El respaldo generado contiene datos de negocio y metadatos de archivos, no los binarios de GridFS, porque esta migración no los modifica.

## Primero revisar

Pega en la sesión de mongosh independiente ya conectada. Usa load(...) sin await delante; el archivo también está preparado para cargarse como script:

~~~javascript
globalThis.BAB_RUTA = "C:/Users/matia/Documents/ChatGPT/Proyecto de BD - Banco de Amilentos/BancoAlimentos_Proyectos";
globalThis.BAB_MODO = "revisar";
load(globalThis.BAB_RUTA + "/db/migraciones/aplicar-v2.mongosh.js");
~~~

Espera a que aparezca REVISIÓN TERMINADA y vuelva el indicador de la consola. Después ejecuta, por separado:

~~~javascript
globalThis.BAB_ULTIMO_RESULTADO;
~~~

Debe mostrar { ok: true, modo: "revisar", errores: 0 }. Un true aislado devuelto por load() solo confirma la carga; no demuestra que la revisión haya pasado. Este paso no modifica la base ni crea archivos.

Si Atlas coincide con los JSON originales, se esperan:

| Elemento | Resultado previsto |
| --- | --- |
| Colecciones de negocio | Se conservan las ocho. |
| Documentos | Se conservan los 49 y sus identificadores. |
| Donaciones | Las siete quedan por_documentar porque no tienen fotos cargadas. |
| Entregas realizadas | ENT-2026-0023 y 0024 quedan por_documentar, sin repetir sus salidas. |
| Entregas pendientes | ENT-2026-0025 y 0026 quedan programadas. |
| Yogur L-0015 | 200 en bodega, 60 reservadas y 140 sin reservar. |
| Pan L-0018 | 150 en bodega, 80 reservadas y 70 sin reservar. |
| Movimientos | Se conservan los 13 y todas sus cantidades. |
| Usuarios | Cinco sin passwordHash hasta inicializar sus cuentas. |

Las cantidades sin reservar solo se ofrecen si el lote es apto. Por ejemplo, las 24 unidades vencidas de L-0003 siguen existiendo físicamente, pero no están disponibles para entregar.

Los avisos sobre contraseñas, PDF pendientes y autores históricos desconocidos describen datos que no se pueden inventar; no son errores de saldo. Cualquier error de referencias, cantidades, reservas, índices incompatibles o documentos detiene la aplicación.

## Después aplicar

Si la revisión termina sin errores:

~~~javascript
globalThis.BAB_MODO = "aplicar";
load(globalThis.BAB_RUTA + "/db/migraciones/aplicar-v2.mongosh.js");
~~~

Espera a que termine y vuelva el indicador de la consola. Después consulta:

~~~javascript
globalThis.BAB_ULTIMO_RESULTADO;
~~~

Antes de cambiar MongoDB, el ejecutor guarda un respaldo EJSON local en db/respaldos. La salida muestra la ruta exacta; consérvala. Esa carpeta está excluida de Git porque el respaldo puede contener datos de contacto o hashes existentes.

El procedimiento amplía temporalmente los validadores para aceptar ambas versiones, transforma los documentos en una transacción, comprueba el esquema nuevo antes de confirmar, crea los índices faltantes y activa los validadores finales. No usa drop() ni borra colecciones.

La migración conserva cantidadDisponible como alias de cantidadEnBodega mientras dure la transición. Ambos deben mantenerse sincronizados en las futuras escrituras. También conserva las fechas y ubicaciones antiguas para trazabilidad y reversión; la aplicación nueva utilizará los campos definidos en el contrato.

Solo se considera terminada cuando imprime MIGRACIÓN VERIFICADA y BAB_ULTIMO_RESULTADO.ok es true. No cierres la consola ni interrumpas el proceso mientras esté aplicando.

## Comprobar el resultado

~~~javascript
var bab = db.getSiblingDB("bab_donaciones");

bab.lotes.find({}, {
  codigo: 1, cantidadEnBodega: 1, cantidadReservada: 1, zona: 1
});

bab.entregas.find({}, {
  codigo: 1, estado: 1, fechaProgramada: 1, fechaEntrega: 1
});

bab.donaciones.find({}, {
  codigo: 1, estado: 1, registradaPor: 1
});

bab.voluntarios.countDocuments({ passwordHash: { $exists: false } });
bab.entregas.getIndexes();

globalThis.BAB_MODO = "revisar";
load(globalThis.BAB_RUTA + "/db/migraciones/aplicar-v2.mongosh.js");
~~~

Cuando termine la segunda revisión, consulta por separado:

~~~javascript
globalThis.BAB_ULTIMO_RESULTADO;
~~~

Debe volver a terminar sin errores y sin documentos por transformar. No consultes ni pegues en el chat los hashes de las cuentas.

## Si se interrumpe o falla

Si aparece MongoshUnimplementedError: [COMMON-90002] load is not currently implemented for this platform, esa consola no puede cargar archivos locales. El archivo de migración no llegó a ejecutarse. Abre mongosh independiente siguiendo Antes de ejecutar y vuelve a empezar por revisar. Pegar todo el archivo en Compass no sustituye este procedimiento: la migración también necesita importar un módulo local y, al aplicar, guardar un respaldo en disco.

Si aparece el error de sintaxis indicando que await solo se permite en funciones async o módulos, vuelve a usar los ejemplos de esta guía sin await delante de load(). El archivo actualizado mantiene await dentro de una función async. Ese error al analizar el bloque inicial impide que se ejecute la migración.

Si aparece el código 8000, revisa también la operación indicada en BAB_ULTIMO_RESULTADO: el código por sí solo no identifica la causa. El 25 de noviembre de 2026 se comprobó en este clúster que getCollectionInfos con un filtro $in sobre name falla, mientras que la consulta sin filtro y la lectura de índices funcionan. El ejecutor corregido obtiene los metadatos sin ese filtro y selecciona las ocho colecciones en memoria. Esta corrección no requiere cambiar permisos ni documentos. Los fallos de lectura ahora incluyen operacion y codigo, sin imprimir el mensaje original del servidor, que podría contener datos sensibles.

En modo revisar, ficheroEstado: undefined es normal: no se genera respaldo ni archivo de estado. Un resultado INCOMPLETA durante revisar significa que la comprobación no terminó; no significa que se haya aplicado parte de la migración.

Si aplicar se detiene por falta de permiso collMod, la cuenta puede leer y actualizar documentos pero no configurar sus validadores. La cuenta comprobada el 25 de noviembre tiene readWriteAnyDatabase y carece de collMod. Añade el permiso administrativo limitado a esta base desde Atlas:

1. Abre Security → Database & Network Access → Database Users.
2. Pulsa Edit en el usuario con el que te conectas a mongosh, el indicado en el comando de conexión con --username.
3. En Database User Privileges, conserva el permiso de lectura y escritura actual. Abre Specific Privileges → Add Specific Privilege.
4. Selecciona dbAdmin, escribe bab_donaciones como Database y deja Collection vacío para cubrir las ocho colecciones.
5. Guarda con Update User y espera a que Atlas aplique el cambio.
6. Sal de mongosh con exit() y vuelve a conectarte con el comando de Atlas. Al ser una sesión nueva, vuelve a definir BAB_RUTA antes de ejecutar revisar y después aplicar.

El permiso collMod forma parte de dbAdmin, según [los permisos de validación de MongoDB](https://www.mongodb.com/docs/compass/connect/required-access/). Los usuarios se editan desde [la administración de usuarios de Atlas](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/).

Se comparó la base con el respaldo bab-v2-2026-11-25T07-18-10-882Z-f7b2d1.ejson después de este fallo: los 49 documentos, las opciones de las ocho colecciones, sus índices y los metadatos de archivos permanecían iguales. Ese intento solo creó el respaldo local. Conserva ese primer respaldo; la siguiente ejecución de aplicar generará otro archivo.

El archivo que termina en .estado.json, junto al respaldo, indica la última fase. Los documentos se transforman juntos, pero modificar índices y validadores son fases separadas.

No inicies la aplicación con un resultado INCOMPLETA. Conserva el primer respaldo, corrige la causa indicada y vuelve a ejecutar revisar. Después se puede reanudar aplicar: la transformación es idempotente y no debe duplicar reservas ni salidas.

Una interrupción de conexión durante la confirmación puede dejar incierto si la transacción terminó; comprueba el estado con revisar antes de decidir el siguiente paso. No restaures a ciegas ni vuelvas a ejecutar seed.js.

El ejecutor detiene la transacción si detecta cambios en los datos desde la lectura inicial. Ejecuta la migración sin otros escritores para evitar inserciones o cambios durante las fases separadas.

## Reversión antes de empezar a trabajar con la aplicación

La reversión restaura los documentos, validadores y opciones anteriores, y retira solo los índices creados por esta ejecución. Se bloquea si hay operaciones posteriores, archivos nuevos, validadores ajenos o índices modificados. Nunca se debe utilizar para borrar trabajo realizado después de la migración.

Selecciona la ruta exacta del primer respaldo anterior al cambio, no un respaldo de una reanudación que ya contenga la versión nueva:

~~~javascript
globalThis.BAB_RESPALDO = globalThis.BAB_RUTA + "/db/respaldos/REEMPLAZAR_CON_EL_NOMBRE_REAL.ejson";
globalThis.BAB_MODO = "revertir";
load(globalThis.BAB_RUTA + "/db/migraciones/aplicar-v2.mongosh.js");
~~~

Al terminar, consulta por separado:

~~~javascript
globalThis.BAB_ULTIMO_RESULTADO;
~~~

Debe terminar con REVERTIDA y ok: true. El respaldo no se borra.

## Contraseñas y siguiente etapa

El campo almacenado será passwordHash. La pantalla pedirá Contraseña y el servidor generará un hash Argon2id. No agregues un campo con la contraseña original ni copies un mismo hash para todas las cuentas.

La inicialización de la primera cuenta se realizará localmente mediante una entrada de contraseña oculta. Puede utilizarse el procedimiento de generación Argon2id explicado en el chat y agregar su resultado a la cuenta específica desde Compass. El backend siempre comprobará activo, verificará el hash y excluirá passwordHash de todas las respuestas.

Esta migración no crea todavía la web, el login ni las alertas. El comportamiento aprobado está en [el contrato de la aplicación](02-contrato-api.md). Los documentos Word y los HTML anteriores siguen siendo referencias previas y deberán alinearse al presentar la versión implementada.

## Qué se comprobó localmente

Las pruebas cubren conservación de cantidades e identificadores, conciliación, límites de reservas, referencias, fotos propias, revisión de la versión correcta, idempotencia, modo de revisión sin escrituras, recuperación ante fallos y bloqueo de reversión con cambios posteriores.

Las 19 pruebas locales pasan; el control de escrituras y recuperación se prueba con MongoDB simulado, incluyendo el rechazo de collMod por falta de permisos. Además, el 25 de noviembre de 2026 se ejecutó revisar contra el Atlas real con el archivo corregido: ok: true, errores: 0, ocho colecciones, 49 documentos por actualizar y 18 índices por crear. Esta comprobación solo leyó datos, opciones de colecciones, índices y metadatos de archivos; no aplicó cambios ni generó respaldos.

El primer intento de aplicación se detuvo porque faltaba collMod; la comparación con el respaldo confirmó que la base seguía sin cambios. Tras corregir ese permiso, el usuario completó la aplicación el 25 de noviembre: VALIDADORES_AMPLIADOS, DATOS_CONFIRMADOS, INDICES_CREADOS y VERIFICADA. El respaldo de esa ejecución es db/respaldos/bab-v2-2026-11-25T07-31-47-785Z-a9ec6f.ejson y su archivo de estado registra VERIFICADA.

La comprobación final independiente ejecutó revisar contra Atlas y confirmó cero documentos por actualizar, cero índices por crear y cero errores. Los lotes L-0015 y L-0018 conservan respectivamente 200 y 150 unidades físicas, con 60 y 80 reservadas. Las cinco cuentas siguen sin passwordHash y los tres convenios siguen pendientes de PDF; son tareas de inicialización y documentación, no fallos de la migración. No se crearon contraseñas ni aprobaciones administrativas.

Fuentes: [ejecutar archivos con load()](https://www.mongodb.com/docs/mongodb-shell/write-scripts/), [mongosh y módulos locales](https://www.mongodb.com/docs/mongodb-shell/write-scripts/require-external-modules/), [collMod](https://www.mongodb.com/docs/manual/reference/command/collmod/) y [transacciones](https://www.mongodb.com/docs/manual/reference/method/session.starttransaction/).
