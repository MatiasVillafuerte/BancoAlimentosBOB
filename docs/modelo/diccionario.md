# Diccionario de datos del modelo implementado

Actualizado el 27 de noviembre de 2026. Derivado del Word de diseño; los campos opcionales se omiten cuando no se conocen.

Las tablas mantienen el contexto de cada colección. Las reglas comunes y la implementación consolidada completan sus campos técnicos.

## 2 Tecnología y arquitectura

| Componente | Uso en el proyecto |
| --- | --- |
| MongoDB Atlas | Base bab_donaciones. Documentos BSON con tipos, validadores e índices; el esquema flexible no elimina las reglas de integridad. |
| Next.js y React | Interfaz en src/app y API en src/app/api |
| GridFS | fs.files conserva metadatos y fs.chunks los fragmentos. Se elige un único mecanismo de almacenamiento para las evidencias del prototipo. |
| Límites y crecimiento | El espacio disponible del clúster se comparte con los archivos. Se deben limitar tamaños y revisar el consumo antes de ampliar el conjunto de pruebas. Escalar el servicio no elimina la necesidad de revisar consultas y costos. |
| Seguridad | TLS hacia Atlas, usuario técnico con permisos controlados, validación del servidor y sesiones revocables. El rol de la aplicación no equivale a un rol administrativo de Atlas. |

## 3 1 Donante

| Campo y tipo | Regla o significado |
| --- | --- |
| tipo · string / nombre · string | Obligatorios. Tipo: empresa, mercado, productor o persona. El nombre identifica al aportante. |
| nit · string / direccion · string | Opcionales. No se exige NIT a una persona ni se deduce su existencia por el tipo de donante. |
| contacto · object | Opcional. Puede contener nombre, funcion, medio, email y telefono; se registran solo los datos disponibles. |
| fechaRegistro · date / activo · bool | Obligatorios. Alta del donante y habilitación para nuevas operaciones; el historial se conserva al desactivarlo. |

## 3 2 Donación

| Campo y tipo | Regla o significado |
| --- | --- |
| codigo · string | Obligatorio y único. Identificador legible, por ejemplo DON-2026-0015. |
| donante · object | Obligatorio: donanteId referencia donantes y nombre conserva el nombre del aportante al registrar la operación. |
| convenioId · ObjectId | Opcional. Referencia a una versión de convenios del mismo donante y aplicable a la recepción. |
| fechaRecepcion · date | Obligatoria. Momento de la recepción física; puede diferir de registradaEn. |
| pesoTotalKg · number | Opcional, no negativo. Peso medido; no se obtiene sumando unidades diferentes. |
| observaciones · string | Opcional. Condiciones de recepción, diferencias u otros datos relevantes. |
| estado · string | por_documentar, recibida, observada o completada. |
| Autoría y revisión | Incluye registradaPor, registradaEn, versionDatos, historial, revision, archivos y claveOperacion descritos en los campos comunes. |

## 3 3 Lote

| Campo y tipo | Regla o significado |
| --- | --- |
| codigo · string / donacionId · ObjectId | Código interno único y referencia obligatoria a la recepción de origen. |
| producto · string / categoria · string | Nombre del producto y categoría: fresco, no perecedero, lácteo, limpieza u otro. |
| cantidad · number / unidad · string | Cantidad recibida originalmente, positiva, y su unidad: bolsa, caja, kg u otra definida para ese lote. |
| cantidadEnBodega · number | Saldo físico actual. Aumenta o disminuye por movimientos, nunca por una aprobación documental. |
| cantidadReservada · number | Cantidad comprometida para entregas programadas. No puede ser negativa ni superar el saldo físico. |
| cantidadDisponible · number | Alias transitorio del saldo físico legado. Mientras exista debe coincidir con cantidadEnBodega; no representa la cantidad libre para nuevas reservas. |
| pesoKg · number | Peso medido opcional. La existencia de una cantidad de bolsas no permite inferir kilos. |
| fechaVencimiento · date | Opcional si se desconoce. FEFO ordena primero lotes aptos con vencimiento; los que no tienen fecha se muestran al final. Los empates se ordenan por código e identificador, sin inventar una fecha. |
| estado · string | disponible, agotado, vencido o descartado. Antes de reservar o entregar se vuelve a comprobar su aptitud y vencimiento. |
| zona · string | Z1 Secos, Z2 Panificados, Z3 Refrigerados o Z4 No alimentos. No registra capacidad ni estante. |
| conservacion · string | ambiente o refrigerado. Los productos congelados quedan fuera de esta versión hasta disponer de una zona apta. |
| atributos · object / ubicacion · string | atributos conserva marca, código de fabricante u otros datos. ubicacion queda como dato legado; la nueva interfaz utiliza zona. |

## 3 4 Organización beneficiaria

| Campo y tipo | Regla o significado |
| --- | --- |
| nombre · string / tipo · string | Nombre y clase de institución; ambos obligatorios. |
| direccion · string / zona · string | Ubicación de la organización. La entrega registra por separado su lugar efectivo. |
| responsable · object | Nombre y teléfono de la persona de contacto. |
| poblacion · object | ninos, adultosMayores y total como enteros no negativos. La ficha describe la población reportada. |
| convenio · ObjectId / activa · bool | convenio es una referencia legada opcional a fs.files, diferente de convenios de donantes. No tiene carga de archivos propia en esta versión. activa habilita nuevas entregas. |

## 3 5 Entrega

| Campo y tipo | Regla o significado |
| --- | --- |
| codigo · string / organizacion · object | Código único y objeto con organizacionId y nombre copiado al registrar el destino. |
| fechaProgramada · date / fechaEntrega · date | La primera identifica el compromiso y se conserva. La segunda solo existe cuando se realiza la entrega. fecha es un campo legado. |
| items · array de objetos | Una línea por lote con loteId, unidad, cantidadProgramada, cantidadReservada y cantidadEntregada. pesoKg es opcional; cantidad es un campo legado. |
| responsablePrevistoId / entregadaPor · ObjectId | El responsable previsto activo es obligatorio al programar nuevas entregas; puede faltar en registros históricos. entregadaPor se toma de la cuenta que confirma la salida y puede diferir del autor inicial. |
| lugar · string / recibidoPor · string | Lugar efectivo de entrega y nombre de quien recibe. recibidoPor es obligatorio para una entrega realizada. |
| beneficiariosPrevistos / beneficiariosAtendidos | Enteros no negativos. El previsto es obligatorio al programar registros nuevos; puede faltar en los históricos. El atendido se confirma al entregar. Su suma mide participaciones, no personas únicas. |
| pesoTotalKg · number / Estado y auditoría | Peso opcional. Incluye los campos comunes. Los estados se detallan en el apartado 6; una entrega realizada histórica puede carecer de cantidadProgramada si su plan se desconoce. |

## 3 6 Movimiento de inventario

| Campo y tipo | Regla o significado |
| --- | --- |
| _id · ObjectId / loteId · ObjectId | Identificador del movimiento y referencia obligatoria al lote afectado. |
| claveOperacion · string | Clave única y estable derivada de la operación y el lote. Un reintento con la misma clave no crea otro movimiento. |
| tipo · string | Determina si suma o resta. Los siete tipos se muestran en la tabla siguiente. |
| cantidad · number / unidad · string | Magnitud positiva en la unidad base del lote. El signo lo determina tipo; no se almacena una cantidad negativa. |
| fecha · date / responsableId · ObjectId | Momento del movimiento y cuenta que lo registra, tomada de la sesión verificada. |
| motivo · string | Explicación obligatoria del hecho o de la corrección, útil para reconstruir el historial. |
| entregaId · ObjectId | Obligatorio en una salida por entrega. También identifica la entrega de origen de un retorno desde el destinatario. |
| origenId · ObjectId | Referencia al movimiento original; obligatorio en devoluciones y ajustes compensatorios. |

| Tipo | Efecto físico y ejemplo |
| --- | --- |
| recepcion | Suma: ingreso de 20 bolsas recibidas de un donante. |
| entrega | Resta: salida real de 8 bolsas a una organización. |
| merma | Resta: 2 bolsas dañadas que se retiran del inventario. |
| devolucionEntrada | Suma: regreso de 1 bolsa desde el destinatario, con revisión de aptitud. |
| devolucionSalida | Resta: devolución de productos al donante. |
| ajusteEntrada | Suma: compensación justificada de una salida registrada por error. |
| ajusteSalida | Resta: compensación justificada de una entrada registrada por error. |

## 3 7 Voluntario y cuenta de usuario

| Campo y tipo | Regla o significado |
| --- | --- |
| nombre · string / email · string / telefono · string | Datos de identidad y contacto. El correo es único; el acceso normaliza el correo a minúsculas y elimina espacios exteriores. |
| rol · string / activo · bool | voluntario, coordinador o administrador. Una cuenta inactiva no puede usar sesiones ya emitidas. |
| passwordHash · string | Hash Argon2id de la contraseña, nunca texto original. Es opcional en las cuentas migradas; sin hash no se permite ingresar. |
| passwordActualizadaEn · date | Fecha del alta o cambio de contraseña. |
| sesiones · array de objetos | Hasta cinco sesiones. Cada una contiene tokenHash, creadaEn y expiraEn. El token original solo viaja en una cookie privada del navegador. |
| sesiones[].tokenHash / creadaEn y expiraEn | tokenHash es una huella SHA-256 de un valor aleatorio. Las fechas BSON delimitan una duración absoluta de ocho horas. |
| acceso · object | intentos y ventanaDesde controlan hasta cinco intentos de verificación por cuenta en quince minutos. Una verificación correcta reinicia el contador. |
| ultimoAccesoEn · date | Fecha del último inicio de sesión correcto. |

## 3 8 Archivos y GridFS

| Campo y tipo | Regla o significado |
| --- | --- |
| _id · ObjectId / filename · string | Identificador del archivo y nombre visible. La operación conserva su _id en archivos[] o pdfId. |
| length · number / chunkSize · number / uploadDate · date | Tamaño, tamaño del fragmento y fecha generados por GridFS. |
| metadata · object | entidad, entidadId, tipo y subidoPor establecen propiedad, clase y autor. mimeType conserva el tipo verificado. estado controla el ciclo de archivo y validacion identifica la comprobación de contenido. |
| metadata opcional | descripcion y loteId contextualizan la evidencia. sha256 identifica el original; ancho y alto describen fotos; paginas describe PDF. verificadaEn registra la comprobación. retiradoEn, retiradoPor y motivoRetiro documentan el retiro. |
| fs.chunks | Cada fragmento contiene _id, files_id, n y data. files_id enlaza con fs.files; n ordena los fragmentos y data contiene los bytes. |

## 3 9 Convenio del donante

| Campo y tipo | Regla o significado |
| --- | --- |
| donanteId · ObjectId / codigo y nombre · string | Donante propietario, identidad estable del acuerdo y título visible. |
| version · entero | Comienza en 1. La combinación codigo y version es única. Una modificación crea otro documento y conserva el anterior. |
| desde y hasta · date | Inicio obligatorio y fin opcional de vigencia. La versión vinculada debe ser aplicable a la recepción. |
| condiciones · string / periodicidad · string | Condiciones obligatorias y periodicidad opcional, únicamente si se pactó. No se supone una frecuencia fija. |
| pdfId · ObjectId | Original opcional en fs.files. La página informa si falta; la ausencia no se completa con archivos ficticios. Una versión admite un PDF inmutable: otro contrato exige crear otra versión de convenio. |

## 4 Diagrama y relaciones

| Relación | Implementación |
| --- | --- |
| Donante y convenio | Un donante tiene varias versiones de convenio. convenios.donanteId identifica al propietario. |
| Donante y donación | donante.donanteId referencia al aportante. convenioId es opcional y debe ser del mismo donante. |
| Donación y lote | lotes.donacionId conserva la recepción de origen. |
| Lote y entrega | items[].loteId enlaza cada línea con el lote y sus cantidades planificadas y reales. |
| Entrega y movimiento | entregaId enlaza la salida por lote con la entrega física. Una reserva no pertenece al historial físico. |
| Responsables y archivos | Autores y revisores referencian voluntarios. archivos[] y pdfId referencian fs.files de su entidad propietaria. convenio de organizaciones permanece legado. |

## 5 Colecciones subdocumentos y referencias

| Colección | Información incrustada y referenciada |
| --- | --- |
| donantes | Incrusta contacto porque describe a ese donante. No incrusta su historial completo de donaciones; estas lo referencian. |
| convenios | Referencia donantes y el PDF. Cada versión tiene identidad propia para conservar el historial. |
| donaciones | Incrusta donante {donanteId, nombre}, revision e historial. Referencia convenio opcional, autores y archivos. Los lotes se consultan por donacionId. |
| lotes | Incrusta atributos variables del producto. Referencia la donación. Sus movimientos se guardan separados para consultar el historial sin cargarlo siempre. |
| organizaciones | Incrusta responsable y poblacion. La referencia convenio a fs.files se conserva como dato legado, sin módulo de carga propio. |
| entregas | Incrusta organizacion e items[], además de revision e historial. Cada item contiene la referencia al lote; no copia el lote entero. |
| movimientos | Referencia lote, usuario, entrega cuando corresponda y movimiento de origen para devoluciones o ajustes. |
| voluntarios | Incrusta hasta cinco sesiones y el control de intentos. Sus datos privados se excluyen de las respuestas. |
| GridFS | fs.files incrusta metadata con referencias al propietario y al autor. fs.chunks referencia el archivo mediante files_id. |

## 6 Estados y control de existencias

| Estado | Significado y efecto |
| --- | --- |
| programada · entrega | Fecha, destino y cantidades definidos. Reserva productos; el saldo físico todavía no cambia. |
| por_documentar | Recepción o entrega ya realizada, con documentación incompleta. El inventario ya refleja el hecho físico. |
| recibida · donación / entregada · entrega | Información y foto mínima completas. Pendiente de validación administrativa; ningún movimiento adicional. |
| observada | El administrador solicita una corrección con motivo. La persona responsable corrige y reenvía a revisión. |
| completada | Administración aprobó la versión actual de la información y sus evidencias. No vuelve a sumar ni restar existencias. |
| cancelada · entrega | Solo antes de la salida física. Libera reservas y conserva el expediente. |

## Ejemplo de reserva y entrega parcial

| Momento | En bodega | Reservado | Libre |
| --- | --- | --- | --- |
| Saldo inicial | 200 | 0 | 200 |
| Se programa una entrega de 100 | 200 | 100 | 100 |
| Otra solicitud de 120 se rechaza | 200 | 100 | 100 |
| Se entregan 80 de las 100 previstas | 120 | 0 | 120 |

## Consistencia de las operaciones

| Índices principales | Finalidad |
| --- | --- |
| email y códigos únicos | Evitan duplicados de usuarios, donaciones, lotes y entregas. codigo + version identifica un convenio. |
| movimientos.claveOperacion | Impide duplicar el mismo movimiento cuando se reintenta una solicitud. |
| zona + estado + vencimiento | Facilita filtrar el inventario y ordenar lotes con vencimiento. |
| donacionId y loteId + fecha | Facilitan reconstruir el origen del lote y su historial de movimientos. |
| estado y registradaPor + estado | Permiten consultar pendientes documentales generales o propios de una cuenta. |

## Campos técnicos y reglas adicionales

| Campo o conjunto | Uso |
| --- | --- |
| Catálogos y operaciones | registradaPor, registradaEn, versionDatos e historial conservan autoría y edición. claveOperacion y solicitudHash distinguen un reintento idéntico de un contenido diferente. No se publican sus huellas privadas. |
| voluntarios.versionAcciones | Entero de control interno. Las escrituras autorizadas lo incrementan dentro de la transacción para coordinarse con una desactivación o cambio de rol. |
| entregas.requiereReasignacion | Booleano. Si una pérdida reduce reservas, impide confirmar hasta que coordinación ajuste la programación. beneficiariosPrevistos no reemplaza beneficiariosAtendidos. |
| movimientos.registradaEn | Fecha de escritura, distinta de fecha del hecho físico cuando se registra una recepción o entrega anterior. solicitudHash controla el contenido del reintento. |
| movimientos.reincorporar | Booleano de devoluciones recibidas. Si el retorno no es apto, se registra su entrada y una merma vinculada, sin aumentar el saldo disponible final. |
| movimientos.reducciones[] | Objetos con entregaId, versionDatos y cantidad. Documentan reservas reducidas junto con la pérdida; los cambios de lotes y entregas son atómicos. |
| historial y revisionAnterior | Cada evento conserva acción, autor, fecha y versión. Puede incluir detalle, archivoId, revisionAnterior y claves internas de reintento. La reapertura conserva la aprobación anterior. |
| revision | Objeto con revisadaPor, revisadaEn, rolAlRevisar, versionRevisada y observacion. Comienza vacío; aprobar y observar validan la versión vigente. El motivo es obligatorio al observar. |
| fs.files.metadata | mimeType, sha256, validacion, verificadaEn, estado, claveOperacion, descripcion y loteId opcional. Fotos incluyen ancho/alto; PDF, paginas. retiradoEn, retiradoPor y motivoRetiro documentan el retiro. La fecha del vínculo queda en el historial del expediente. |
