# Informes y trazabilidad

Actualizado el 27 de noviembre de 2026.

**Informes** reúne las recepciones y entregas físicamente realizadas durante las fechas elegidas.
El enlace **Ver recorrido de los lotes y sus donaciones** de cada entrega abre la trazabilidad.
Ambas consultas son de lectura y no requieren otra migración en MongoDB.

## Qué significan las cifras

- El período incluye ambos días completos, en horario de Bolivia (UTC−4).
- La recepción se cuenta por `fechaRecepcion`; la entrega, por `fechaEntrega`. Una programación no
  cuenta como salida, aunque conserve campos históricos de peso o atenciones.
- Se muestra la situación documental actual de esas operaciones. Una aprobación realizada después
  del período cuenta como vigente al consultar; el informe no reconstruye un cierre contable pasado.
- Una operación validada requiere `completada`, revisor y fecha, rol administrativo al revisar y
  `revision.versionRevisada === versionDatos`. El resto aparece sin validación vigente.
- Las cantidades se obtienen de movimientos originales y sus correcciones y devoluciones, incluso
  si estas ocurrieron después del período. No se borran los originales.
- **Corregida** = original más ajustes según el signo del movimiento. **Neta** = corregida menos
  devoluciones. La cantidad neta de una recepción no es el saldo de bodega: también existen entregas y mermas.
- Se agrupan nombres de producto exactamente iguales y unidades iguales. No hay conversión de envases;
  para comparar presentaciones distintas se consulta cada lote. No se suma un total entre unidades.
- Los kilos son la suma de los pesos originales disponibles, acompañada de su cobertura. No se estima
  un dato ausente ni se interpreta una cantidad de bolsas como kilos. No se recalcula el peso de ajustes
  o devoluciones que no tienen pesaje. Cero conocido y ausencia de información se distinguen.
- Las atenciones suman participaciones reportadas. No representan personas únicas.

Ejemplo: se entregan 80 bolsas, administración corrige un error de 5 y después retornan 10.
El informe conserva 80 originales, 75 corregidas, 10 devueltas y 65 netas. La aprobación documental
no altera ninguna de esas cantidades.

## Permisos y recorrido

Administración consulta todo. Coordinación consulta sus recepciones y todas las entregas.
Voluntariado consulta sus recepciones y las entregas propias, asignadas o realizadas. Cada informe
indica su alcance; no debe interpretarse el informe de un voluntario como el total del banco.

La trazabilidad muestra, por cada línea, donante y convenio opcional → recepción → lote → entrega.
Si el usuario no puede abrir la recepción de origen, se ocultan sus datos y su convenio. No se concede
acceso por el solo hecho de participar en la entrega. Los enlaces a expedientes permiten consultar
las evidencias privadas con los mismos controles de acceso.

Los informes y la trazabilidad leen una instantánea transaccional coherente. Comprueban nuevamente
que la cuenta siga activa y con el mismo rol; las respuestas HTTP no se almacenan en caché.
No devuelven credenciales, huellas privadas, contactos personales ni archivos binarios.

## API y límites del prototipo

| Consulta | Resultado |
| --- | --- |
| `GET /api/informes/resumen?desde=2026-11-01&hasta=2026-11-27` | Resumen, cobertura y cantidades por producto/unidad de ambas secciones. |
| `GET /api/trazabilidad/ENT-2026-0023` | Recorrido de todas las líneas de la entrega accesible. |

Sin fechas, se utiliza el mes actual hasta hoy en Bolivia. Se admiten hasta 366 días, 500 operaciones
por sección, 15000 lotes/movimientos originales y 60000 movimientos relacionados por sección.
Si se supera un límite, se pide reducir el período: no se entrega un total truncado.
Las líneas históricas sin movimiento original se señalan como información incompleta.
El informe es una consulta en pantalla y JSON; no incluye exportación Excel/PDF ni reportes programados.

Implementación: `src/lib/informes`, `src/app/informes`, `src/app/trazabilidad` y sus rutas API.
Pruebas: `tests/informes.test.ts` y `tests/integration/recorrido.test.ts`.
