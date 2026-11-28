# Preparación de la presentación del proyecto

Actualizado el 27 de noviembre de 2026. La fecha anotada para la presentación preliminar es
el 2 de diciembre de 2026 a las 13:00. Este plan reúne los materiales de la aplicación implementada.

| Lo que pide la tarea | Material vigente |
| --- | --- |
| Tema y problema | Perfil académico: centralización documental como solución a una necesidad hipotética del BAB. |
| Estructura, campos y relaciones | [Diseño Word](modelo/Diseno_BD_BAB.docx), [diccionario](modelo/diccionario.md) y [diagrama draw.io](modelo/relaciones.drawio). |
| Datos de muestra | Base del prototipo ya migrada; recorrido automatizado con datos ficticios aislados. |
| Interfaz | Aplicación React en `src/app`; las páginas de `frontend` son maquetas anteriores. |
| Demostración | [Guion de diez pasos](12-demostracion.md) con recepción, reservas, entrega parcial, evidencia, aprobación e informe. |
| Instalación y uso | [Manual técnico](11-manual-tecnico.md) y [manual de usuario](10-manual-usuario.md). |
| Evidencia de funcionamiento | [Verificación final](13-verificacion-final.md). |

## Preparación entre los dos integrantes

1. Explicar el problema hipotético y la limitación de no conocer los procedimientos internos del BAB.
2. Abrir el diagrama y seguir una entrega hasta su lote, recepción, donante y convenio opcional.
3. Mostrar cómo MongoDB combina documentos BSON, referencias, objetos incrustados y archivos GridFS.
4. Ensayar el recorrido de la guía 12 y repartir la explicación entre organización documental e inventario.
5. Comprobar antes de clase la conexión a Atlas, la cuenta de cada expositor y el inicio de la aplicación.

Las seis etapas de implementación están descritas en el [plan de entrega](05-plan-entrega.md).
No ejecutes `db/seed.js` sobre la base migrada: corresponde al modelo anterior y borra colecciones.
Las diapositivas, si se utilizan, deben resumir estos materiales; este avance no genera un archivo de presentación.
