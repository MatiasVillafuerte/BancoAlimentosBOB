# Verificación final del prototipo BAB

Cierre de la etapa 6, 27 de noviembre de 2026 (hora de Bolivia).
La aplicación y los materiales de entrega están en la rama `feat/backend-auth`.

## Resultado

El prototipo integra acceso, cuentas, catálogos, recepción, inventario, FEFO, programación y entrega,
evidencias, revisión administrativa, informes y trazabilidad. Las operaciones documentales no repiten
los movimientos físicos. El [plan de entrega](05-plan-entrega.md) registra las seis etapas completadas.

| Comprobación | Resultado observado |
| --- | --- |
| `npm test` | 71 pruebas aprobadas: 52 de aplicación y 19 de migración. |
| `npm run test:integration` | 43 escenarios aprobados: 10 de registros, 15 de inventario, 14 de documentos y 4 del recorrido final. El ejecutor cuenta 47 pruebas con los cuatro contenedores. |
| `npm run lint` | Sin errores. |
| `npm run typecheck` | Sin errores. |
| `npm run build` | Compilación optimizada completa, con las páginas y rutas de informes y trazabilidad. |
| Revisión final de cálculos | Cuatro pruebas locales de informes y el recorrido de integración repetidos después del ajuste de sus consultas. |
| Lectura sobre la base del proyecto | 14 consultas por cuenta, dos rutas sin sesión rechazadas y huella de colecciones de negocio/archivos conservada antes y después. |
| Interfaz | Inspección en Chrome de escritorio y emulación móvil de 393 × 852: informes, trazabilidad y ficha de entrega con evidencias. |
| Word | Documento de 16 páginas revisado visualmente; estructura y portada conservadas. Exportación con Word a PDF y renderizado de páginas con Poppler. |
| Diagrama | XML validado, identificadores y referencias coherentes, campos legibles y conexiones principales sin atravesar etiquetas. |

Las pruebas de integración utilizan transacciones, validadores e índices reales y originales en GridFS.
Crean bases `bab_test_<identificador>` independientes, y sus colecciones se retiraron al finalizar.
No se ejecutó el seed ni una nueva migración sobre `bab_donaciones`; tampoco se reiniciaron contraseñas.
Las pantallas se inspeccionaron con la sesión existente; las escrituras completas se probaron mediante
servicios de integración, no mediante un recorrido automatizado de clics en el navegador.

## Recorrido probado

1. Registrar un aportante ocasional sin convenio y recibir 200 bolsas.
2. Subir una fotografía, enviar a revisión, observar, corregir y aprobar la recepción.
3. Reservar 100 bolsas y rechazar otras 120 porque solo quedan 100 libres.
4. Confirmar 80, liberar el remanente y repetir la solicitud sin duplicar la salida.
5. Documentar y aprobar la entrega; consultar su trazabilidad y comprobar el alcance de otras cuentas.
6. Registrar una devolución de 10 al día siguiente: salida original 80, neta 70 y saldo físico 130.
7. Comprobar que la devolución no inventa peso ni cambia la aprobación del hecho original;
   los informes la atribuyen a la operación de origen y una cuenta inactiva pierde acceso.

El comando reproducible y el guion de clase están en [la demostración](12-demostracion.md).

## Documentación entregada

- [Manual de usuario](10-manual-usuario.md) y [manual técnico](11-manual-tecnico.md).
- [Cálculos y alcance de informes](09-informes-y-trazabilidad.md).
- [Diseño Word](modelo/Diseno_BD_BAB.docx), [diccionario](modelo/diccionario.md) y [diagrama editable](modelo/relaciones.drawio).
- Contrato API y guías de acceso, registros, inventario y evidencias actualizados.

El archivo principal `3_Diseno_BD_corregido.docx`, situado fuera de la carpeta del repositorio,
se actualizó en el mismo archivo. Su copia versionada coincide con él. El perfil académico no fue
reescrito en esta etapa: se contrastaron su hipótesis y sus límites con el alcance implementado.

## Límites del cierre

Es una entrega del prototipo local, sin despliegue público ni fusión automática hacia `main`.
No acredita los procedimientos internos del BAB. No incluye exportación de informes, avisos externos,
personas únicas, gestión de congelados ni capacidades inventadas para las zonas de bodega.
Los informes presentan operaciones de un período con sus correcciones actuales; no reconstruyen cierres pasados.
La recuperación completa de un respaldo de producción y las pruebas de carga de gran volumen quedan
fuera de esta verificación. Los límites de consulta y de archivos se documentan en los manuales.
