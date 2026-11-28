# Manual de usuario del prototipo BAB

Versión de entrega del 27 de noviembre de 2026. Este manual describe la aplicación implementada.
Las maquetas HTML y el Word previo de pantallas son referencias de diseño, no instrucciones vigentes.
Se trabaja con datos ficticios y una bodega dividida en cuatro zonas.

## Acceso y responsabilidades

Abre `http://localhost:3000` con el servidor iniciado. Ingresa con tu correo y contraseña.
**Mi cuenta** permite cambiarla; **Salir** cierra la sesión. La contraseña administradora ya elegida
se conserva. No es necesario conectar Compass para que funcione la web.

| Acción | Voluntariado | Coordinación | Administración |
| --- | --- | --- | --- |
| Registrar donante y recepción | Sí | Sí | Sí |
| Consultar recepciones | Propias | Propias | Todas |
| Programar, modificar y cancelar entregas | No | Sí | Sí |
| Consultar o confirmar entregas | Propias, asignadas o realizadas | Todas | Todas |
| Organizaciones y convenios | Consulta permitida | Gestionar | Gestionar |
| Mermas y devoluciones | No | Sí | Sí |
| Ajustes de cantidades y revisión documental | No | No | Sí |
| Crear y habilitar cuentas | No | No | Sí |

El servidor asigna automáticamente la cuenta que registra, confirma, carga archivos o revisa.
No se elige manualmente un autor. El responsable previsto de una entrega sí se asigna al programar.

## Registrar una recepción

1. Busca al aportante en **Catálogos → Donantes** o regístralo. Una persona ocasional no necesita NIT
   ni convenio. Completa el contacto solo cuando lo conozcas.
2. Abre **Donaciones → Registrar recepción**. Selecciona donante, fecha real y, si corresponde,
   una versión vigente del convenio del mismo donante.
3. Añade de 1 a 30 lotes. Registra producto, categoría, cantidad, unidad, zona y conservación.
   Incluye vencimiento y peso medido cuando existan. La foto no reemplaza estos campos consultables.
4. Guarda. La donación, los lotes y sus entradas se confirman juntos. La ficha queda **Por documentar**;
   los productos ya figuran físicamente en bodega.
5. En la ficha, carga fotografías de los productos o etiquetas y PDF cuando corresponda. Cada archivo
   pertenece a esta operación. Puedes añadir varios, de uno en uno.
6. Pulsa **Enviar a revisión** cuando esté completo. Una recepción requiere al menos una foto válida.
   La carga por sí sola no envía el expediente ni lo aprueba.

En **Catálogos → Convenios**, coordinación o administración registra las condiciones y vigencia.
Abre **PDF y expediente** para cargar el original. Cada versión conserva un PDF; cambiar el contrato
exige otra versión. La falta de convenio de una donación ocasional no es un error.

## Inventario y entregas

**Inventario** permite filtrar las zonas Z1 Secos, Z2 Panificados, Z3 Refrigerados y Z4 No alimentos.
No hay mapa ni estimación de capacidad. Distingue físico, reservado y libre. Los lotes vencidos o
descartados siguen visibles, pero no se ofrecen para nuevas entregas.

**Sugerencias FEFO** ordena lo apto por vencimiento para la fecha prevista. Los lotes sin fecha quedan
al final y se identifican. Consultar una sugerencia no crea una reserva.

1. Coordinación abre **Entregas → Programar entrega**. Selecciona organización activa, fecha, lugar,
   responsable previsto, atenciones previstas y cantidades por lote.
2. Guardar reserva productos, sin descontarlos físicamente. Una programación se puede modificar
   o cancelar con motivo; las reservas se ajustan juntas.
3. Al realizar la entrega, abre su ficha y confirma la fecha real, lugar, receptor, atenciones y
   cantidades reales. Puedes entregar menos de lo reservado; el remanente se libera.
4. Carga una fotografía de entrega y los demás comprobantes. Envía a revisión. **Entregada · por revisar**
   acredita expediente presentado; **Completada** requiere validación administrativa.

Con 200 bolsas, una reserva de 100 deja 100 libres. Otra de 120 se rechaza. Si se entregan 80,
quedan 120 físicas, cero reservadas y 120 libres. Reintentar la misma confirmación no descuenta dos veces.
Para comprometer las 20 no utilizadas se crea otra programación.

## Corregir y documentar

**Pendientes** reúne operaciones por documentar, por revisar u observadas. Administración abre la ficha,
comprueba los datos y evidencias y elige aprobar o solicitar correcciones con una observación.
La ficha muestra el contacto de la persona responsable; la aplicación no envía mensajes automáticamente.

Una operación observada conserva la solicitud de cambio. Corrige los datos descriptivos permitidos,
añade o retira evidencias con motivo y vuelve a enviarla. Para modificar una completada, administración
debe reabrirla con motivo. La revisión anterior se conserva en el historial.

Los errores de cantidades se corrigen con movimientos desde el lote, no editando el saldo ni borrando
la entrega. Una devolución se vincula a la salida original; una devolución al donante, a la recepción.
Una merma que afecta reservas exige reducirlas y luego reasignar las entregas afectadas. Los ajustes
son exclusivos de administración. Véanse ejemplos en [inventario y entregas](07-inventario-y-entregas.md).

Se admiten JPEG, PNG, WebP y PDF estáticos, hasta 10 MiB por archivo y 20 evidencias activas por operación.
Una foto válida técnicamente todavía necesita revisión humana. Los archivos se descargan desde la
ficha con sesión; no se comparten mediante enlaces públicos. No es necesario fotografiar personas.

## Consultar el resultado

Desde la entrega abre **Ver recorrido de los lotes y sus donaciones**. Cada lote muestra el origen
permitido para tu cuenta y sus cantidades originales, corregidas, devueltas y netas.
En **Informes**, selecciona un período y revisa tanto lo realizado como su validación administrativa.
Lee la cobertura del peso y de las atenciones; no son estimaciones de datos faltantes.
La [guía de informes](09-informes-y-trazabilidad.md) explica los cálculos.

## Mensajes frecuentes

| Mensaje o situación | Qué hacer |
| --- | --- |
| Origen no permitido | Abrir localhost:3000 o 127.0.0.1:3000 con el puerto de `APP_URL`. |
| La operación cambió | Recargar la ficha para revisar la versión más reciente antes de volver a enviar. |
| Saldo insuficiente | Revisar la cantidad libre y las reservas; no editar MongoDB manualmente. |
| Falta foto o datos | Completar los campos indicados y enviar explícitamente a revisión. |
| Archivo no disponible | Comprobar acceso y vínculo con el expediente; un archivo histórico sin validar requiere revisión. |
| Sesión vencida | Volver a iniciar sesión; dura como máximo ocho horas. |
| Fallo temporal al guardar | Conservar el formulario y reintentar la misma solicitud; no registrar otra operación a ciegas. |
