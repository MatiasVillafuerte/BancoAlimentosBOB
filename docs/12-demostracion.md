# Demostración de la entrega final

Usa datos ficticios. El recorrido automatizado crea y elimina su propia base temporal; permite demostrar
la lógica completa sin llenar la base del proyecto con evidencias o aprobaciones artificiales.

```powershell
node --env-file=.env.local --import tsx --test tests/integration/recorrido.test.ts
```

## Recorrido para exponer en clase

| Paso | Acción | Resultado que se explica |
| --- | --- | --- |
| 1 | Iniciar sesión y mostrar Mi cuenta | Rol y autoría automática; la contraseña nunca se guarda en texto. |
| 2 | Registrar un aportante ocasional y una recepción de 200 bolsas | Sin convenio obligatorio; lote en Z1 y movimiento de entrada. |
| 3 | Adjuntar una fotografía, enviar a revisión, observar, corregir y aprobar | Revisión humana y versiones; no cambia el inventario al aprobar. |
| 4 | Programar 100 bolsas para una organización | 200 físicas, 100 reservadas, 100 libres. |
| 5 | Intentar programar otras 120 | Se rechaza por saldo libre insuficiente. |
| 6 | Confirmar solo 80 bolsas y repetir la misma solicitud | 120 físicas y cero reservadas; la repetición no duplica la salida. |
| 7 | Adjuntar evidencia y aprobar la entrega | Por documentar → Entregada por revisar → Completada. |
| 8 | Abrir la trazabilidad | Relación entre destino, lote y recepción; convenio cuando existe. |
| 9 | Registrar devolución posterior de 10 | Original 80, devuelta 10, neta 70; bodega 130. |
| 10 | Consultar informes con distintas cuentas | Hechos físicos separados de aprobación y alcance limitado por permisos. |

En una demostración manual, usa la fecha y hora reales, cantidades equivalentes y una organización y
usuarios de prueba identificados. Esas acciones sí guardan datos: hazlas en una copia preparada para la
presentación o conserva los registros como demostración. No las ejecutes sobre operaciones reales.
Para probar otro rol utiliza una cuenta habilitada desde Equipo; no cambies los roles directamente en MongoDB.

## Relación con la consigna académica

El perfil conserva sus seis apartados: introducción, identificación del problema, justificación,
objetivo general, objetivos específicos y límites. La evidencia internacional motiva una hipótesis;
no demuestra que el BAB tenga desorganización documental ni un sistema anticuado.

La solución construida permite evaluar centralización, trazabilidad y colaboración con un caso simulado.
Fotografías y PDF se relacionan con documentos BSON, cantidades, responsables y fechas consultables.
MongoDB documental y GridFS resuelven conjuntamente los datos estructurados y los archivos complejos.
La nube facilita acceso compartido y transacciones, pero no garantiza por sí sola calidad, seguridad o disponibilidad.

El archivo académico `Perfil revisado.docx` conserva ese planteamiento. Sus diagramas conceptuales no
describen los estados internos de la aplicación: la distinción física/documental final se explica en el
diseño y en los manuales. La frecuencia de donación depende del convenio y no se presume.

## Entrega y Git

La rama `feat/backend-auth` contiene todos los avances; `main` conserva la base original. Antes de un
commit revisa `git status`, archivos nuevos y `git diff`. Incluye únicamente código y documentación públicos.
No agregues `.env.local`, `.runtime`, `node_modules`, `.next` ni `db/respaldos`.

```powershell
git switch feat/backend-auth
git status
git diff
git add src tests docs README.md
git diff --cached --stat
git commit -m "docs: ajustar entrega del prototipo BAB"
git push origin feat/backend-auth
```

El commit de ejemplo se ejecuta solo si existen cambios propios pendientes. Para integrar en `main`,
abre un Pull Request de `feat/backend-auth` hacia `main`, revisa el resultado y decide la fusión.
No se fusiona ni se despliega automáticamente.
