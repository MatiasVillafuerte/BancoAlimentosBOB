// ============================================================
// Banco de Alimentos de Bolivia - base de datos (MongoDB Atlas)
// Crea las colecciones con su validación, los índices y los
// datos ficticios de ejemplo.
//
// Cómo usarlo (con mongosh):
//   mongosh "TU_CADENA_DE_CONEXION" --file seed.js
// Cuidado: BORRA y vuelve a crear las colecciones del proyecto.
// ============================================================

const nombreBD = "bab_donaciones";
const bd = db.getSiblingDB(nombreBD);

const oid = { bsonType: "objectId" };
const texto = { bsonType: "string" };
const fecha = { bsonType: "date" };

const esquemas = {
  voluntarios: {
    required: ["nombre", "email", "telefono", "rol", "activo"],
    properties: {
      nombre: texto, email: texto, telefono: texto,
      rol: { enum: ["voluntario", "coordinador", "administrador"] },
      activo: { bsonType: "bool" },
      passwordHash: texto   // lo crea el backend (nunca se guarda la contraseña)
    }
  },
  donantes: {
    required: ["tipo", "nombre", "contacto", "fechaRegistro", "activo"],
    properties: {
      tipo: { enum: ["empresa", "mercado", "productor", "persona"] },
      nombre: texto, nit: texto, contacto: { bsonType: "object" },
      direccion: texto, fechaRegistro: fecha, activo: { bsonType: "bool" }
    }
  },
  convenios: {
    required: ["donanteId", "codigo", "nombre", "version", "desde", "condiciones"],
    properties: {
      donanteId: oid, codigo: texto, nombre: texto,
      version: { bsonType: "number", minimum: 1 },
      desde: fecha, hasta: fecha, condiciones: texto, periodicidad: texto,
      pdfId: oid   // archivo en GridFS (se completa al subir el PDF)
    }
  },
  organizaciones: {
    required: ["nombre", "tipo", "direccion", "zona", "responsable", "poblacion", "activa"],
    properties: {
      nombre: texto, tipo: texto, direccion: texto, zona: texto,
      responsable: { bsonType: "object" }, poblacion: { bsonType: "object" },
      convenio: oid, activa: { bsonType: "bool" }
    }
  },
  donaciones: {
    required: ["codigo", "donante", "fechaRecepcion", "registradaPor"],
    properties: {
      codigo: texto, donante: { bsonType: "object" }, fechaRecepcion: fecha,
      registradaPor: oid, pesoTotalKg: { bsonType: "number" },
      archivos: { bsonType: "array" }, observaciones: texto, convenioId: oid
    }
  },
  lotes: {
    required: ["donacionId", "producto", "categoria", "cantidad", "unidad", "cantidadDisponible", "estado", "ubicacion", "conservacion"],
    properties: {
      codigo: texto, donacionId: oid, producto: texto, categoria: texto,
      cantidad: { bsonType: "number", minimum: 0 }, unidad: texto,
      pesoKg: { bsonType: "number" },
      cantidadDisponible: { bsonType: "number", minimum: 0 },
      fechaVencimiento: fecha,
      estado: { enum: ["disponible", "agotado", "vencido", "descartado"] },
      atributos: { bsonType: "object" }, ubicacion: texto,
      conservacion: { enum: ["ambiente", "refrigerado", "congelado"] }
    }
  },
  entregas: {
    required: ["codigo", "organizacion", "fecha", "items", "beneficiariosAtendidos", "entregadaPor", "recibidoPor", "lugar", "estado"],
    properties: {
      codigo: texto, organizacion: { bsonType: "object" }, fecha: fecha,
      items: { bsonType: "array", minItems: 1 },
      pesoTotalKg: { bsonType: "number" },
      beneficiariosAtendidos: { bsonType: "number" },
      entregadaPor: oid, recibidoPor: texto, archivos: { bsonType: "array" },
      lugar: texto,
      estado: { enum: ["programada", "en preparación", "entregada"] }  // campo agregado por la pantalla Entregas
    }
  },
  movimientos: {
    required: ["claveOperacion", "loteId", "tipo", "cantidad", "unidad", "fecha", "responsableId", "motivo"],
    properties: {
      claveOperacion: texto, loteId: oid,
      tipo: { enum: ["recepcion", "entrega", "merma", "devolucionEntrada", "devolucionSalida"] },
      cantidad: { bsonType: "number", minimum: 0 }, unidad: texto,
      fecha: fecha, responsableId: oid, motivo: texto, entregaId: oid, origenId: oid
    }
  }
};

// Índices: [colección, campos, opciones]
const indices = [
  ["voluntarios", { email: 1 }, { unique: true }],
  ["donaciones", { codigo: 1 }, { unique: true }],
  ["lotes", { fechaVencimiento: 1 }, {}],          // para FEFO
  ["lotes", { estado: 1, ubicacion: 1 }, {}],
  ["entregas", { codigo: 1 }, { unique: true }],
  ["entregas", { "organizacion.organizacionId": 1 }, {}],
  ["entregas", { "items.loteId": 1 }, {}],         // trazabilidad
  ["movimientos", { claveOperacion: 1 }, { unique: true }],
  ["movimientos", { loteId: 1, fecha: 1 }, {}]
];

// ---------- crear colecciones ----------
for (const nombre of Object.keys(esquemas)) {
  bd.getCollection(nombre).drop();
  bd.createCollection(nombre, {
    validator: { $jsonSchema: Object.assign({ bsonType: "object" }, esquemas[nombre]) },
    validationLevel: "strict", validationAction: "error"
  });
}
for (const [col, campos, op] of indices) bd.getCollection(col).createIndex(campos, op);

// ---------- datos de ejemplo ----------
const datos = {
  voluntarios: [{"_id":ObjectId("6a1f00000000000000000001"),"nombre":"Ana Demo","email":"ana.demo@example.com","telefono":"70000010","rol":"coordinador","activo":true},{"_id":ObjectId("6a1f00000000000000000002"),"nombre":"Luis Demo","email":"luis.demo@example.com","telefono":"70000011","rol":"voluntario","activo":true},{"_id":ObjectId("6a1f00000000000000000003"),"nombre":"Carla Demo","email":"carla.demo@example.com","telefono":"70000012","rol":"voluntario","activo":true},{"_id":ObjectId("6a1f00000000000000000004"),"nombre":"Admin Demo","email":"admin.demo@example.com","telefono":"70000013","rol":"administrador","activo":true},{"_id":ObjectId("6a1f00000000000000000005"),"nombre":"Pedro Demo","email":"pedro.demo@example.com","telefono":"70000014","rol":"voluntario","activo":false}],
  donantes: [{"_id":ObjectId("6a1f00000000000000000006"),"tipo":"empresa","nombre":"Supermercado Demo S.A.","contacto":{"nombre":"Encargado de donaciones","funcion":"Donaciones","medio":"Correo y teléfono"},"direccion":"Cochabamba","fechaRegistro":ISODate("2026-03-12T12:00:00Z"),"activo":true,"nit":"0000000000"},{"_id":ObjectId("6a1f00000000000000000007"),"tipo":"mercado","nombre":"Mercado Campesino Demo","contacto":{"nombre":"Encargado del mercado","funcion":"Administración","medio":"Teléfono"},"direccion":"Cochabamba","fechaRegistro":ISODate("2026-03-20T12:00:00Z"),"activo":true},{"_id":ObjectId("6a1f00000000000000000008"),"tipo":"empresa","nombre":"Panificadora Demo S.R.L.","contacto":{"nombre":"Encargado de ventas","funcion":"Ventas","medio":"Correo"},"direccion":"Cochabamba","fechaRegistro":ISODate("2026-04-02T12:00:00Z"),"activo":true,"nit":"0000000001"},{"_id":ObjectId("6a1f00000000000000000009"),"tipo":"productor","nombre":"Productor Demo (frutas)","contacto":{"nombre":"Productor Demo","funcion":"Productor","medio":"Teléfono"},"direccion":"Cochabamba","fechaRegistro":ISODate("2026-05-10T12:00:00Z"),"activo":true},{"_id":ObjectId("6a1f0000000000000000000a"),"tipo":"persona","nombre":"Donante Persona Demo","contacto":{"nombre":"Donante Persona Demo","funcion":"Persona","medio":"Teléfono"},"direccion":"Cochabamba","fechaRegistro":ISODate("2026-06-01T12:00:00Z"),"activo":false}],
  convenios: [{"_id":ObjectId("6a1f0000000000000000000b"),"donanteId":ObjectId("6a1f00000000000000000006"),"codigo":"CONV-001","nombre":"Convenio de donación Supermercado Demo","version":1,"desde":ISODate("2026-03-01T12:00:00Z"),"hasta":ISODate("2026-08-31T12:00:00Z"),"condiciones":"Donación de productos próximos a vencer, con entrega en bodega.","periodicidad":"semanal"},{"_id":ObjectId("6a1f0000000000000000000c"),"donanteId":ObjectId("6a1f00000000000000000006"),"codigo":"CONV-001","nombre":"Convenio de donación Supermercado Demo","version":2,"desde":ISODate("2026-09-01T12:00:00Z"),"condiciones":"Se amplía la lista de productos y se incluyen lácteos refrigerados.","periodicidad":"semanal"},{"_id":ObjectId("6a1f0000000000000000000d"),"donanteId":ObjectId("6a1f00000000000000000007"),"codigo":"CONV-002","nombre":"Convenio Mercado Campesino Demo","version":1,"desde":ISODate("2026-03-20T12:00:00Z"),"condiciones":"Frutas y verduras de temporada."}],
  organizaciones: [{"_id":ObjectId("6a1f0000000000000000000e"),"nombre":"Hogar de Niños Demo","tipo":"hogar de niños","direccion":"Zona Norte, Cochabamba","zona":"Zona Norte","responsable":{"nombre":"Persona Demo","telefono":"70000000"},"poblacion":{"ninos":45,"adultosMayores":0,"total":45},"activa":true},{"_id":ObjectId("6a1f0000000000000000000f"),"nombre":"Asilo Demo","tipo":"asilo","direccion":"Zona Sur, Cochabamba","zona":"Zona Sur","responsable":{"nombre":"Persona Demo","telefono":"70000001"},"poblacion":{"ninos":0,"adultosMayores":32,"total":32},"activa":true},{"_id":ObjectId("6a1f00000000000000000010"),"nombre":"Comedor Popular Demo","tipo":"comedor","direccion":"Zona Central, Cochabamba","zona":"Zona Central","responsable":{"nombre":"Persona Demo","telefono":"70000002"},"poblacion":{"ninos":60,"adultosMayores":25,"total":85},"activa":true},{"_id":ObjectId("6a1f00000000000000000011"),"nombre":"Hogar Demo II","tipo":"hogar de niños","direccion":"Zona Oeste, Cochabamba","zona":"Zona Oeste","responsable":{"nombre":"Persona Demo","telefono":"70000003"},"poblacion":{"ninos":20,"adultosMayores":0,"total":20},"activa":false}],
  donaciones: [{"_id":ObjectId("6a1f00000000000000000012"),"codigo":"DON-2026-0015","donante":{"donanteId":ObjectId("6a1f00000000000000000006"),"nombre":"Supermercado Demo S.A."},"fechaRecepcion":ISODate("2026-09-30T12:00:00Z"),"registradaPor":ObjectId("6a1f00000000000000000002"),"archivos":[],"observaciones":"Datos ficticios de ejemplo","convenioId":ObjectId("6a1f0000000000000000000b")},{"_id":ObjectId("6a1f00000000000000000013"),"codigo":"DON-2026-0024","donante":{"donanteId":ObjectId("6a1f00000000000000000006"),"nombre":"Supermercado Demo S.A."},"fechaRecepcion":ISODate("2026-11-02T12:00:00Z"),"registradaPor":ObjectId("6a1f00000000000000000002"),"archivos":[],"observaciones":"Datos ficticios de ejemplo","convenioId":ObjectId("6a1f0000000000000000000c")},{"_id":ObjectId("6a1f00000000000000000014"),"codigo":"DON-2026-0027","donante":{"donanteId":ObjectId("6a1f00000000000000000006"),"nombre":"Supermercado Demo S.A."},"fechaRecepcion":ISODate("2026-11-08T12:00:00Z"),"registradaPor":ObjectId("6a1f00000000000000000003"),"archivos":[],"observaciones":"Datos ficticios de ejemplo","convenioId":ObjectId("6a1f0000000000000000000c")},{"_id":ObjectId("6a1f00000000000000000015"),"codigo":"DON-2026-0028","donante":{"donanteId":ObjectId("6a1f00000000000000000009"),"nombre":"Productor Demo (frutas)"},"fechaRecepcion":ISODate("2026-11-12T12:00:00Z"),"registradaPor":ObjectId("6a1f00000000000000000001"),"archivos":[],"observaciones":"Datos ficticios de ejemplo"},{"_id":ObjectId("6a1f00000000000000000016"),"codigo":"DON-2026-0029","donante":{"donanteId":ObjectId("6a1f00000000000000000007"),"nombre":"Mercado Campesino Demo"},"fechaRecepcion":ISODate("2026-11-15T12:00:00Z"),"registradaPor":ObjectId("6a1f00000000000000000003"),"archivos":[],"observaciones":"Datos ficticios de ejemplo","convenioId":ObjectId("6a1f0000000000000000000d")},{"_id":ObjectId("6a1f00000000000000000017"),"codigo":"DON-2026-0030","donante":{"donanteId":ObjectId("6a1f00000000000000000008"),"nombre":"Panificadora Demo S.R.L."},"fechaRecepcion":ISODate("2026-11-18T12:00:00Z"),"registradaPor":ObjectId("6a1f00000000000000000002"),"archivos":[],"observaciones":"Datos ficticios de ejemplo"},{"_id":ObjectId("6a1f00000000000000000018"),"codigo":"DON-2026-0031","donante":{"donanteId":ObjectId("6a1f00000000000000000006"),"nombre":"Supermercado Demo S.A."},"fechaRecepcion":ISODate("2026-11-20T12:00:00Z"),"registradaPor":ObjectId("6a1f00000000000000000001"),"archivos":[],"observaciones":"Datos ficticios de ejemplo","convenioId":ObjectId("6a1f0000000000000000000c")}],
  lotes: [{"_id":ObjectId("6a1f00000000000000000019"),"codigo":"L-0003","donacionId":ObjectId("6a1f00000000000000000012"),"producto":"Jugo de fruta","categoria":"no perecedero","cantidad":36,"unidad":"un","cantidadDisponible":24,"estado":"vencido","ubicacion":"Z2-E3","conservacion":"ambiente","fechaVencimiento":ISODate("2026-10-10T12:00:00Z")},{"_id":ObjectId("6a1f0000000000000000001a"),"codigo":"L-0009","donacionId":ObjectId("6a1f00000000000000000013"),"producto":"Arroz (25 kg)","categoria":"no perecedero","cantidad":58,"unidad":"bolsas","cantidadDisponible":40,"estado":"disponible","ubicacion":"Z1-E4","conservacion":"ambiente","fechaVencimiento":ISODate("2027-03-15T12:00:00Z")},{"_id":ObjectId("6a1f0000000000000000001b"),"codigo":"L-0012","donacionId":ObjectId("6a1f00000000000000000018"),"producto":"Leche UHT 1 L","categoria":"lácteo","cantidad":110,"unidad":"cajas","cantidadDisponible":80,"estado":"disponible","ubicacion":"Z1-E2","conservacion":"ambiente","fechaVencimiento":ISODate("2026-11-29T12:00:00Z")},{"_id":ObjectId("6a1f0000000000000000001c"),"codigo":"L-0015","donacionId":ObjectId("6a1f00000000000000000015"),"producto":"Yogur natural","categoria":"lácteo","cantidad":300,"unidad":"un","cantidadDisponible":200,"estado":"disponible","ubicacion":"Z3-E1","conservacion":"refrigerado","fechaVencimiento":ISODate("2026-12-02T12:00:00Z")},{"_id":ObjectId("6a1f0000000000000000001d"),"codigo":"L-0017","donacionId":ObjectId("6a1f00000000000000000013"),"producto":"Fideos","categoria":"no perecedero","cantidad":60,"unidad":"bolsas","cantidadDisponible":60,"estado":"disponible","ubicacion":"Z1-E4","conservacion":"ambiente","fechaVencimiento":ISODate("2027-01-10T12:00:00Z")},{"_id":ObjectId("6a1f0000000000000000001e"),"codigo":"L-0018","donacionId":ObjectId("6a1f00000000000000000017"),"producto":"Pan de molde","categoria":"fresco","cantidad":150,"unidad":"un","cantidadDisponible":150,"estado":"disponible","ubicacion":"Z2-E1","conservacion":"ambiente","fechaVencimiento":ISODate("2026-12-04T12:00:00Z")},{"_id":ObjectId("6a1f0000000000000000001f"),"codigo":"L-0020","donacionId":ObjectId("6a1f00000000000000000016"),"producto":"Manzanas","categoria":"fresco","cantidad":120,"unidad":"kg","cantidadDisponible":120,"estado":"disponible","ubicacion":"Z3-E3","conservacion":"refrigerado"},{"_id":ObjectId("6a1f00000000000000000020"),"codigo":"L-0021","donacionId":ObjectId("6a1f00000000000000000014"),"producto":"Detergente","categoria":"limpieza","cantidad":30,"unidad":"un","cantidadDisponible":30,"estado":"disponible","ubicacion":"Z4-E1","conservacion":"ambiente"}],
  entregas: [{"_id":ObjectId("6a1f00000000000000000021"),"codigo":"ENT-2026-0023","organizacion":{"organizacionId":ObjectId("6a1f00000000000000000010"),"nombre":"Comedor Popular Demo"},"fecha":ISODate("2026-11-14T12:00:00Z"),"items":[{"loteId":ObjectId("6a1f0000000000000000001a"),"cantidad":20,"unidad":"bolsas"}],"beneficiariosAtendidos":85,"entregadaPor":ObjectId("6a1f00000000000000000002"),"recibidoPor":"Persona Demo","lugar":"Comedor Popular Demo","estado":"entregada","archivos":[]},{"_id":ObjectId("6a1f00000000000000000022"),"codigo":"ENT-2026-0024","organizacion":{"organizacionId":ObjectId("6a1f0000000000000000000e"),"nombre":"Hogar de Niños Demo"},"fecha":ISODate("2026-11-21T12:00:00Z"),"items":[{"loteId":ObjectId("6a1f0000000000000000001b"),"cantidad":30,"unidad":"cajas"},{"loteId":ObjectId("6a1f0000000000000000001c"),"cantidad":100,"unidad":"un"}],"beneficiariosAtendidos":45,"entregadaPor":ObjectId("6a1f00000000000000000002"),"recibidoPor":"Persona Demo","lugar":"Hogar de Niños Demo","estado":"entregada","archivos":[]},{"_id":ObjectId("6a1f00000000000000000023"),"codigo":"ENT-2026-0025","organizacion":{"organizacionId":ObjectId("6a1f0000000000000000000f"),"nombre":"Asilo Demo"},"fecha":ISODate("2026-11-23T12:00:00Z"),"items":[{"loteId":ObjectId("6a1f0000000000000000001c"),"cantidad":60,"unidad":"un"}],"beneficiariosAtendidos":32,"entregadaPor":ObjectId("6a1f00000000000000000001"),"recibidoPor":"","lugar":"Asilo Demo","estado":"en preparación","archivos":[]},{"_id":ObjectId("6a1f00000000000000000024"),"codigo":"ENT-2026-0026","organizacion":{"organizacionId":ObjectId("6a1f00000000000000000010"),"nombre":"Comedor Popular Demo"},"fecha":ISODate("2026-11-24T12:00:00Z"),"items":[{"loteId":ObjectId("6a1f0000000000000000001e"),"cantidad":80,"unidad":"un"}],"beneficiariosAtendidos":85,"entregadaPor":ObjectId("6a1f00000000000000000001"),"recibidoPor":"","lugar":"Comedor Popular Demo","estado":"programada","archivos":[]}],
  movimientos: [{"_id":ObjectId("6a1f00000000000000000025"),"claveOperacion":"recepcion-L-0003-2026-09-30-1","loteId":ObjectId("6a1f00000000000000000019"),"tipo":"recepcion","cantidad":36,"unidad":"un","fecha":ISODate("2026-09-30T12:00:00Z"),"responsableId":ObjectId("6a1f00000000000000000002"),"motivo":"Recepción DON-2026-0015"},{"_id":ObjectId("6a1f00000000000000000026"),"claveOperacion":"recepcion-L-0009-2026-11-02-2","loteId":ObjectId("6a1f0000000000000000001a"),"tipo":"recepcion","cantidad":58,"unidad":"bolsas","fecha":ISODate("2026-11-02T12:00:00Z"),"responsableId":ObjectId("6a1f00000000000000000002"),"motivo":"Recepción DON-2026-0024"},{"_id":ObjectId("6a1f00000000000000000027"),"claveOperacion":"recepcion-L-0017-2026-11-02-3","loteId":ObjectId("6a1f0000000000000000001d"),"tipo":"recepcion","cantidad":60,"unidad":"bolsas","fecha":ISODate("2026-11-02T12:00:00Z"),"responsableId":ObjectId("6a1f00000000000000000002"),"motivo":"Recepción DON-2026-0024"},{"_id":ObjectId("6a1f00000000000000000028"),"claveOperacion":"recepcion-L-0012-2026-11-20-4","loteId":ObjectId("6a1f0000000000000000001b"),"tipo":"recepcion","cantidad":110,"unidad":"cajas","fecha":ISODate("2026-11-20T12:00:00Z"),"responsableId":ObjectId("6a1f00000000000000000001"),"motivo":"Recepción DON-2026-0031"},{"_id":ObjectId("6a1f00000000000000000029"),"claveOperacion":"recepcion-L-0015-2026-11-12-5","loteId":ObjectId("6a1f0000000000000000001c"),"tipo":"recepcion","cantidad":300,"unidad":"un","fecha":ISODate("2026-11-12T12:00:00Z"),"responsableId":ObjectId("6a1f00000000000000000001"),"motivo":"Recepción DON-2026-0028"},{"_id":ObjectId("6a1f0000000000000000002a"),"claveOperacion":"recepcion-L-0018-2026-11-18-6","loteId":ObjectId("6a1f0000000000000000001e"),"tipo":"recepcion","cantidad":150,"unidad":"un","fecha":ISODate("2026-11-18T12:00:00Z"),"responsableId":ObjectId("6a1f00000000000000000002"),"motivo":"Recepción DON-2026-0030"},{"_id":ObjectId("6a1f0000000000000000002b"),"claveOperacion":"recepcion-L-0020-2026-11-15-7","loteId":ObjectId("6a1f0000000000000000001f"),"tipo":"recepcion","cantidad":120,"unidad":"kg","fecha":ISODate("2026-11-15T12:00:00Z"),"responsableId":ObjectId("6a1f00000000000000000003"),"motivo":"Recepción DON-2026-0029"},{"_id":ObjectId("6a1f0000000000000000002c"),"claveOperacion":"recepcion-L-0021-2026-11-08-8","loteId":ObjectId("6a1f00000000000000000020"),"tipo":"recepcion","cantidad":30,"unidad":"un","fecha":ISODate("2026-11-08T12:00:00Z"),"responsableId":ObjectId("6a1f00000000000000000003"),"motivo":"Recepción DON-2026-0027"},{"_id":ObjectId("6a1f0000000000000000002d"),"claveOperacion":"entrega-L-0009-2026-11-14-9","loteId":ObjectId("6a1f0000000000000000001a"),"tipo":"entrega","cantidad":20,"unidad":"bolsas","fecha":ISODate("2026-11-14T12:00:00Z"),"responsableId":ObjectId("6a1f00000000000000000002"),"motivo":"ENT-2026-0023","entregaId":ObjectId("6a1f00000000000000000021")},{"_id":ObjectId("6a1f0000000000000000002e"),"claveOperacion":"entrega-L-0012-2026-11-21-10","loteId":ObjectId("6a1f0000000000000000001b"),"tipo":"entrega","cantidad":30,"unidad":"cajas","fecha":ISODate("2026-11-21T12:00:00Z"),"responsableId":ObjectId("6a1f00000000000000000002"),"motivo":"ENT-2026-0024","entregaId":ObjectId("6a1f00000000000000000022")},{"_id":ObjectId("6a1f0000000000000000002f"),"claveOperacion":"entrega-L-0015-2026-11-21-11","loteId":ObjectId("6a1f0000000000000000001c"),"tipo":"entrega","cantidad":100,"unidad":"un","fecha":ISODate("2026-11-21T12:00:00Z"),"responsableId":ObjectId("6a1f00000000000000000002"),"motivo":"ENT-2026-0024","entregaId":ObjectId("6a1f00000000000000000022")},{"_id":ObjectId("6a1f00000000000000000030"),"claveOperacion":"merma-L-0003-2026-11-19-12","loteId":ObjectId("6a1f00000000000000000019"),"tipo":"merma","cantidad":12,"unidad":"un","fecha":ISODate("2026-11-19T12:00:00Z"),"responsableId":ObjectId("6a1f00000000000000000001"),"motivo":"Envases dañados al transportar"},{"_id":ObjectId("6a1f00000000000000000031"),"claveOperacion":"devolucionEntrada-L-0009-2026-11-19-13","loteId":ObjectId("6a1f0000000000000000001a"),"tipo":"devolucionEntrada","cantidad":2,"unidad":"bolsas","fecha":ISODate("2026-11-19T12:00:00Z"),"responsableId":ObjectId("6a1f00000000000000000002"),"motivo":"Devuelto por la organización · corrige ENT-2026-0023","entregaId":ObjectId("6a1f00000000000000000021")}]
};

// Orden: primero lo que no depende de nada
for (const nombre of ["voluntarios", "donantes", "convenios", "organizaciones", "donaciones", "lotes", "entregas", "movimientos"]) {
  const r = bd.getCollection(nombre).insertMany(datos[nombre]);
  print(nombre + ": " + Object.keys(r.insertedIds).length + " documentos");
}
print("Listo. Base de datos: " + nombreBD);
