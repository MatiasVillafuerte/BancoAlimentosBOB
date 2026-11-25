"use strict";

// Transformación pura: no conecta con MongoDB ni escribe archivos.
const COLECCIONES = [
  "voluntarios", "donantes", "convenios", "organizaciones",
  "donaciones", "lotes", "entregas", "movimientos"
];
const SIGNOS = {
  recepcion: 1, entrega: -1, merma: -1, devolucionEntrada: 1,
  devolucionSalida: -1, ajusteEntrada: 1, ajusteSalida: -1
};
const ESTADOS_ENTREGA = [
  "programada", "por_documentar", "entregada", "observada", "completada", "cancelada"
];
const ESTADOS_DONACION = ["por_documentar", "recibida", "observada", "completada"];
const id = x => x == null ? "" : x.$oid || (x.toHexString ? x.toHexString() : String(x));
const numero = x => Number(x);
const ms = x => new Date(x && x.$date ? x.$date : x).getTime();
function copia(x) {
  if (x == null || typeof x !== "object") return x;
  if (x instanceof Date) return new Date(x);
  if (x._bsontype || x.toHexString) return x;
  if (Array.isArray(x)) return x.map(copia);
  return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, copia(v)]));
}
function construirPlan(origen, archivos = [], ahora = new Date()) {
  const datos = copia(origen);
  const errores = [], avisos = [], cambios = [];
  for (const c of COLECCIONES) {
    if (!Array.isArray(datos[c])) errores.push("Falta la colección " + c);
  }
  if (errores.length) return { datos, errores, avisos, cambios };
  const mapas = Object.fromEntries(COLECCIONES.map(c => [c, new Map(datos[c].map(d => [id(d._id), d]))]));
  const archivosPorId = new Map(archivos.map(a => [id(a._id), a]));
  function referencia(c, valor, contexto) {
    if (!mapas[c].has(id(valor))) errores.push(contexto + ": referencia inexistente a " + c);
  }
  function fotoDe(d, entidad) {
    return (d.archivos || []).some(aid => {
      const a = archivosPorId.get(id(aid));
      const m = a && a.metadata;
      return m && m.tipo === "foto" && m.entidad === entidad && id(m.entidadId) === id(d._id);
    });
  }
  function preparar(d, c) {
    if (numero(d.modeloVersion) === 2) return false;
    if (d.modeloVersion != null) errores.push(c + ": versión de modelo desconocida");
    d.modeloVersion = 2;
    d.migracionV2 = { fecha: ahora, origen: "modelo_anterior" };
    cambios.push(c + "/" + (d.codigo || id(d._id)));
    return true;
  }
  for (const u of datos.voluntarios) {
    if (preparar(u, "voluntarios")) u.email = u.email.trim().toLowerCase();
    if (!u.passwordHash) avisos.push("Cuenta sin passwordHash: " + id(u._id) + ". No podrá iniciar sesión.");
  }
  for (const c of ["donantes", "convenios", "organizaciones", "movimientos"]) {
    for (const d of datos[c]) preparar(d, c);
  }
  // Reparaciones autorizadas, limitadas a los dos registros ficticios conocidos.
  const demoDon = mapas.donaciones.get("6a1f00000000000000000012");
  const versionDos = mapas.convenios.get("6a1f0000000000000000000c");
  if (demoDon && numero(demoDon.modeloVersion) !== 2 && demoDon.codigo === "DON-2026-0015" &&
      id(demoDon.convenioId) === "6a1f0000000000000000000b" && versionDos &&
      id(versionDos.donanteId) === id(demoDon.donante.donanteId) &&
      ms(demoDon.fechaRecepcion) === Date.parse("2026-09-30T12:00:00Z")) {
    demoDon.convenioId = versionDos._id;
    avisos.push("Se corrige DON-2026-0015 a CONV-001 versión 2.");
  }
  const devolucion = mapas.movimientos.get("6a1f00000000000000000031");
  const salida = mapas.movimientos.get("6a1f0000000000000000002d");
  if (devolucion && !devolucion.origenId && salida &&
      devolucion.tipo === "devolucionEntrada" && salida.tipo === "entrega" &&
      id(devolucion.loteId) === id(salida.loteId) &&
      id(devolucion.entregaId) === id(salida.entregaId) &&
      numero(devolucion.cantidad) === 2 && numero(salida.cantidad) === 20) {
    devolucion.origenId = salida._id;
    avisos.push("Se completa el origen de la devolución ficticia de 2 bolsas.");
  }
  for (const d of datos.donaciones) {
    if (preparar(d, "donaciones")) {
      d.archivos = d.archivos || [];
      d.estado = fotoDe(d, "donaciones") ? "recibida" : "por_documentar";
      d.versionDatos = 1;
      d.historial = [];
      d.revision = {};
    }
    if (!ESTADOS_DONACION.includes(d.estado)) errores.push(d.codigo + ": estado desconocido");
    referencia("donantes", d.donante && d.donante.donanteId, d.codigo);
    referencia("voluntarios", d.registradaPor, d.codigo);
    if (d.convenioId) {
      referencia("convenios", d.convenioId, d.codigo);
      const c = mapas.convenios.get(id(d.convenioId));
      if (c && (id(c.donanteId) !== id(d.donante.donanteId) ||
          ms(d.fechaRecepcion) < ms(c.desde) || (c.hasta && ms(d.fechaRecepcion) > ms(c.hasta)))) {
        errores.push(d.codigo + ": convenio de otro donante o fuera de vigencia");
      }
    }
  }
  const reservas = new Map(datos.lotes.map(l => [id(l._id), 0]));
  for (const e of datos.entregas) {
    if (preparar(e, "entregas")) {
      const pendiente = ["programada", "en preparación"].includes(e.estado);
      if (!pendiente && e.estado !== "entregada") errores.push(e.codigo + ": estado legado no reconocido");
      e.archivos = e.archivos || [];
      if (pendiente) {
        e.estado = "programada";
        e.fechaProgramada = e.fecha;
        e.beneficiariosPrevistos = e.beneficiariosAtendidos;
        if (e.entregadaPor) e.responsablePrevistoId = e.entregadaPor;
      } else {
        e.fechaEntrega = e.fecha;
        e.estado = fotoDe(e, "entregas") ? "entregada" : "por_documentar";
      }
      // entregadaPor no demuestra quién creó el registro: no inventamos registradaPor.
      if (!e.registradaPor) avisos.push(e.codigo + ": autor de registro histórico no confirmado; se conserva el responsable anterior.");
      e.items = e.items.map(i => ({
        ...i,
        ...(pendiente ? { cantidadProgramada: i.cantidad } : {}),
        cantidadReservada: pendiente ? i.cantidad : 0,
        cantidadEntregada: pendiente ? 0 : i.cantidad
      }));
      e.versionDatos = 1;
      e.historial = [];
      e.revision = {};
    }
    if (!ESTADOS_ENTREGA.includes(e.estado)) errores.push(e.codigo + ": estado desconocido");
    referencia("organizaciones", e.organizacion && e.organizacion.organizacionId, e.codigo);
    if (e.registradaPor) referencia("voluntarios", e.registradaPor, e.codigo);
    if (e.entregadaPor) referencia("voluntarios", e.entregadaPor, e.codigo);
    if (!Array.isArray(e.items) || !e.items.length) {
      errores.push(e.codigo + ": entrega sin líneas");
      continue;
    }
    const vistos = new Set();
    for (const i of e.items) {
      const lid = id(i.loteId), l = mapas.lotes.get(lid);
      referencia("lotes", i.loteId, e.codigo);
      if (vistos.has(lid)) errores.push(e.codigo + ": lote repetido en sus líneas");
      vistos.add(lid);
      if (l && i.unidad !== l.unidad) errores.push(e.codigo + ": unidad distinta de la del lote");
      if (numero(i.cantidadReservada) < 0 || numero(i.cantidadEntregada) < 0) errores.push(e.codigo + ": cantidad negativa");
      if (e.estado === "programada") {
        if (!(numero(i.cantidadProgramada) > 0) || numero(i.cantidadEntregada) !== 0 ||
            numero(i.cantidadReservada) > numero(i.cantidadProgramada)) errores.push(e.codigo + ": reserva inválida");
        reservas.set(lid, (reservas.get(lid) || 0) + numero(i.cantidadReservada));
        if (l && numero(i.cantidadReservada) > 0 &&
            (["vencido", "descartado", "agotado"].includes(l.estado) ||
            (l.fechaVencimiento && ms(l.fechaVencimiento) < ms(e.fechaProgramada)))) {
          errores.push(e.codigo + ": reserva sobre lote no apto o que vence antes de la fecha programada");
        }
      } else if (numero(i.cantidadReservada) !== 0) {
        errores.push(e.codigo + ": operación no programada con reserva activa");
      }
      const salidas = datos.movimientos.filter(m => m.tipo === "entrega" &&
        id(m.entregaId) === id(e._id) && id(m.loteId) === lid);
      const total = salidas.reduce((s, m) => s + numero(m.cantidad), 0);
      if (Math.abs(total - numero(i.cantidadEntregada)) > 1e-8) errores.push(e.codigo + ": cantidad entregada no coincide con movimientos");
    }
  }
  const saldos = new Map(datos.lotes.map(l => [id(l._id), 0]));
  for (const m of datos.movimientos) {
    referencia("lotes", m.loteId, "Movimiento " + id(m._id));
    referencia("voluntarios", m.responsableId, "Movimiento " + id(m._id));
    if (!(numero(m.cantidad) > 0) || !Object.hasOwn(SIGNOS, m.tipo)) errores.push("Movimiento inválido " + id(m._id));
    const l = mapas.lotes.get(id(m.loteId));
    if (l && l.unidad !== m.unidad) errores.push("Unidad incorrecta en movimiento " + id(m._id));
    saldos.set(id(m.loteId), (saldos.get(id(m.loteId)) || 0) + SIGNOS[m.tipo] * numero(m.cantidad));
    if (m.entregaId) referencia("entregas", m.entregaId, "Movimiento " + id(m._id));
    if (m.tipo === "entrega" && !m.entregaId) errores.push("Salida sin entregaId " + id(m._id));
    if (["devolucionEntrada", "devolucionSalida", "ajusteEntrada", "ajusteSalida"].includes(m.tipo)) {
      const original = mapas.movimientos.get(id(m.origenId));
      if (!original || id(original.loteId) !== id(m.loteId) || id(m.origenId) === id(m._id)) {
        errores.push("Movimiento sin origen válido " + id(m._id));
      }
    }
  }
  for (const l of datos.lotes) {
    if (preparar(l, "lotes")) {
      l.cantidadEnBodega = l.cantidadDisponible;
      l.cantidadReservada = reservas.get(id(l._id)) || 0;
      l.zona = l.zona || String(l.ubicacion || "").split("-")[0];
    }
    referencia("donaciones", l.donacionId, l.codigo);
    if (!["Z1", "Z2", "Z3", "Z4"].includes(l.zona)) errores.push(l.codigo + ": zona desconocida");
    if (!["ambiente", "refrigerado"].includes(l.conservacion)) errores.push(l.codigo + ": conservación fuera del alcance aprobado");
    const fisico = numero(l.cantidadEnBodega), reservado = numero(l.cantidadReservada);
    if (!Number.isFinite(fisico) || Math.abs(fisico - saldos.get(id(l._id))) > 1e-8) errores.push(l.codigo + ": saldo no conciliado con movimientos");
    if (l.cantidadDisponible != null && numero(l.cantidadDisponible) !== fisico) errores.push(l.codigo + ": alias anterior cantidadDisponible desincronizado");
    if (!Number.isFinite(reservado) || reservado < 0 || reservado > fisico ||
        Math.abs(reservado - (reservas.get(id(l._id)) || 0)) > 1e-8) errores.push(l.codigo + ": reservas excesivas o no conciliadas");
  }
  for (const c of datos.convenios) {
    referencia("donantes", c.donanteId, c.codigo);
    if (!Number.isInteger(numero(c.version)) || numero(c.version) < 1) errores.push(c.codigo + ": versión no entera");
    if (!c.pdfId) avisos.push(c.codigo + " v" + c.version + ": PDF pendiente; no se inventa un archivo.");
    else if (!archivosPorId.has(id(c.pdfId))) errores.push(c.codigo + ": pdfId inexistente");
  }
  for (const c of ["donaciones", "entregas"]) {
    for (const d of datos[c]) {
      for (const aid of d.archivos || []) {
        const a = archivosPorId.get(id(aid));
        if (!a) errores.push(d.codigo + ": archivo inexistente");
        else if (!a.metadata || a.metadata.entidad !== c || id(a.metadata.entidadId) !== id(d._id)) errores.push(d.codigo + ": archivo asociado a otra operación");
      }
      if (["recibida", "entregada", "completada"].includes(d.estado) && !fotoDe(d, c)) errores.push(d.codigo + ": estado documentado sin foto propia");
      if (d.estado === "completada") {
        const r = d.revision || {}, revisor = mapas.voluntarios.get(id(r.revisadaPor));
        if (!revisor || r.rolAlRevisar !== "administrador" || !r.revisadaEn ||
            numero(r.versionRevisada) !== numero(d.versionDatos)) errores.push(d.codigo + ": aprobación administrativa inválida");
      }
    }
  }
  const unicos = [
    ["voluntarios", d => d.email.trim().toLowerCase()],
    ["donaciones", d => d.codigo], ["lotes", d => d.codigo], ["entregas", d => d.codigo],
    ["convenios", d => d.codigo + "/" + numero(d.version)],
    ["movimientos", d => d.claveOperacion]
  ];
  for (const [c, clave] of unicos) {
    const vistos = new Set();
    for (const d of datos[c]) {
      const valor = clave(d);
      if (!valor || vistos.has(valor)) errores.push(c + ": clave ausente o duplicada");
      vistos.add(valor);
    }
  }
  return { datos, errores: [...new Set(errores)], avisos: [...new Set(avisos)], cambios };
}

const oid = { bsonType: "objectId" }, fecha = { bsonType: "date" };
const texto = { bsonType: "string", minLength: 1 };
const numeroNoNegativo = { bsonType: "number", minimum: 0 };
const positivo = { bsonType: "number", minimum: 0, exclusiveMinimum: true };
const entero = { bsonType: "number", minimum: 0, multipleOf: 1 };
const archivos = { bsonType: "array", uniqueItems: true, items: oid };
const objeto = (required, properties, extra = {}) => ({
  bsonType: "object", ...(required.length ? { required } : {}), properties, ...extra
});
const referenciaNombre = campo => objeto([campo, "nombre"], { [campo]: oid, nombre: texto });
const auditoria = {
  versionDatos: { ...entero, minimum: 1 },
  registradaPor: oid, registradaEn: fecha,
  historial: {
    bsonType: "array",
    items: objeto(["accion", "usuarioId", "fecha"], {
      accion: texto, usuarioId: oid, fecha, detalle: { bsonType: "string" }, versionDatos: entero
    })
  },
  revision: objeto([], {
    revisadaPor: oid, revisadaEn: fecha, versionRevisada: { ...entero, minimum: 1 },
    rolAlRevisar: { enum: ["administrador"] },
    observacion: { bsonType: "string" }
  })
};
const aprobacion = {
  anyOf: [
    { properties: { estado: { not: { enum: ["completada"] } } } },
    { required: ["revision"], properties: {
      revision: objeto(["revisadaPor", "revisadaEn", "versionRevisada", "rolAlRevisar"], auditoria.revision.properties)
    } }
  ]
};
const autorNuevo = {
  anyOf: [
    { required: ["registradaPor", "registradaEn"] },
    { required: ["migracionV2"], properties: { migracionV2: { bsonType: "object" } } }
  ]
};
const observacion = {
  anyOf: [
    { properties: { estado: { not: { enum: ["observada"] } } } },
    { required: ["revision"], properties: {
      revision: objeto(["revisadaPor", "revisadaEn", "versionRevisada", "rolAlRevisar", "observacion"], {
        ...auditoria.revision.properties, observacion: texto
      })
    } }
  ]
};
const fotoDocumentada = estados => ({
  anyOf: [
    { properties: { estado: { not: { enum: estados } } } },
    { required: ["archivos"], properties: { archivos: { ...archivos, minItems: 1 } } }
  ]
});
const esquemas = {
  voluntarios: objeto(["nombre", "email", "telefono", "rol", "activo"], {
    nombre: texto, email: texto, telefono: texto, activo: { bsonType: "bool" },
    rol: { enum: ["voluntario", "coordinador", "administrador"] },
    passwordHash: { ...texto, pattern: "^\\$argon2id\\$" }, passwordActualizadaEn: fecha
  }),
  donantes: objeto(["tipo", "nombre", "fechaRegistro", "activo"], {
    tipo: { enum: ["empresa", "mercado", "productor", "persona"] }, nombre: texto,
    nit: texto, direccion: texto, fechaRegistro: fecha, activo: { bsonType: "bool" },
    contacto: objeto([], { nombre: texto, funcion: texto, medio: texto, email: texto, telefono: texto })
  }),
  convenios: objeto(["donanteId", "codigo", "nombre", "version", "desde", "condiciones"], {
    donanteId: oid, codigo: texto, nombre: texto, version: { ...entero, minimum: 1 },
    desde: fecha, hasta: fecha, condiciones: texto, periodicidad: texto, pdfId: oid
  }),
  organizaciones: objeto(["nombre", "tipo", "direccion", "zona", "responsable", "poblacion", "activa"], {
    nombre: texto, tipo: texto, direccion: texto, zona: texto, activa: { bsonType: "bool" }, convenio: oid,
    responsable: objeto(["nombre", "telefono"], { nombre: texto, telefono: texto }),
    poblacion: objeto(["ninos", "adultosMayores", "total"], { ninos: entero, adultosMayores: entero, total: entero })
  }),
  donaciones: objeto(["codigo", "donante", "fechaRecepcion", "registradaPor", "estado", "archivos", "versionDatos", "historial", "revision"], {
    codigo: texto, donante: referenciaNombre("donanteId"), fechaRecepcion: fecha,
    convenioId: oid, pesoTotalKg: numeroNoNegativo, observaciones: { bsonType: "string" },
    archivos, estado: { enum: ESTADOS_DONACION }, claveOperacion: texto, ...auditoria
  }, { allOf: [aprobacion, observacion, autorNuevo, fotoDocumentada(["recibida", "completada"])] }),
  lotes: objeto(["codigo", "donacionId", "producto", "categoria", "cantidad", "unidad", "cantidadEnBodega", "cantidadReservada", "estado", "zona", "conservacion"], {
    codigo: texto, donacionId: oid, producto: texto,
    categoria: { enum: ["fresco", "no perecedero", "lácteo", "limpieza", "otro"] },
    cantidad: positivo, unidad: texto, cantidadEnBodega: numeroNoNegativo, cantidadReservada: numeroNoNegativo,
    cantidadDisponible: numeroNoNegativo, pesoKg: numeroNoNegativo, fechaVencimiento: fecha,
    estado: { enum: ["disponible", "agotado", "vencido", "descartado"] },
    zona: { enum: ["Z1", "Z2", "Z3", "Z4"] }, conservacion: { enum: ["ambiente", "refrigerado"] },
    atributos: { bsonType: "object" }, ubicacion: texto
  }),
  entregas: objeto(["codigo", "organizacion", "estado", "items", "lugar", "archivos", "versionDatos", "historial", "revision"], {
    codigo: texto, organizacion: referenciaNombre("organizacionId"), estado: { enum: ESTADOS_ENTREGA },
    fechaProgramada: fecha, fechaEntrega: fecha, fecha: fecha,
    items: { bsonType: "array", minItems: 1, items: objeto(
      ["loteId", "unidad", "cantidadReservada", "cantidadEntregada"], {
        loteId: oid, unidad: texto, cantidad: positivo, cantidadProgramada: positivo,
        cantidadReservada: numeroNoNegativo, cantidadEntregada: numeroNoNegativo, pesoKg: numeroNoNegativo
      })
    },
    beneficiariosPrevistos: entero, beneficiariosAtendidos: entero, pesoTotalKg: numeroNoNegativo,
    responsablePrevistoId: oid, entregadaPor: oid, recibidoPor: { bsonType: "string" },
    lugar: texto, archivos, claveOperacion: texto, ...auditoria
  }, { allOf: [
    aprobacion, observacion, autorNuevo, fotoDocumentada(["entregada", "completada"]),
    { anyOf: [
      { properties: { estado: { enum: ["programada", "cancelada"] } }, required: ["fechaProgramada"] },
      { properties: { estado: { enum: ["por_documentar", "entregada", "observada", "completada"] }, recibidoPor: texto },
        required: ["fechaEntrega", "entregadaPor", "recibidoPor", "beneficiariosAtendidos"] }
    ] }
  ] }),
  movimientos: objeto(["claveOperacion", "loteId", "tipo", "cantidad", "unidad", "fecha", "responsableId", "motivo"], {
    claveOperacion: texto, loteId: oid, tipo: { enum: Object.keys(SIGNOS) },
    cantidad: positivo, unidad: texto, fecha, responsableId: oid, motivo: texto, entregaId: oid, origenId: oid
  }, { allOf: [
    { anyOf: [
      { properties: { tipo: { not: { enum: ["entrega"] } } } }, { required: ["entregaId"] }
    ] },
    { anyOf: [
      { properties: { tipo: { not: { enum: ["devolucionEntrada", "devolucionSalida", "ajusteEntrada", "ajusteSalida"] } } } },
      { required: ["origenId"] }
    ] }
  ] })
};
const validadores = Object.fromEntries(COLECCIONES.map(c => {
  const s = esquemas[c];
  s.required = [...s.required, "modeloVersion"];
  s.properties.modeloVersion = { enum: [2] };
  const v = { $jsonSchema: s };
  if (c === "lotes") return [c, { $and: [v, { $expr: { $and: [
    { $lte: ["$cantidadReservada", "$cantidadEnBodega"] },
    { $eq: [{ $ifNull: ["$cantidadDisponible", "$cantidadEnBodega"] }, "$cantidadEnBodega"] }
  ] } }] }];
  if (["donaciones", "entregas"].includes(c)) return [c, { $and: [
    v, { $or: [
      { estado: { $ne: "completada" } },
      { $expr: { $eq: ["$revision.versionRevisada", "$versionDatos"] } }
    ] }
  ] }];
  return [c, v];
}));
const indices = [
  ["voluntarios", { email: 1 }, { unique: true }],
  ["convenios", { codigo: 1, version: 1 }, { unique: true }],
  ["donaciones", { codigo: 1 }, { unique: true }],
  ["lotes", { codigo: 1 }, { unique: true }],
  ["lotes", { zona: 1, estado: 1, fechaVencimiento: 1 }, {}],
  ["lotes", { donacionId: 1 }, {}],
  ["entregas", { codigo: 1 }, { unique: true }],
  ["entregas", { "organizacion.organizacionId": 1 }, {}],
  ["entregas", { "items.loteId": 1 }, {}],
  ["movimientos", { claveOperacion: 1 }, { unique: true }],
  ["movimientos", { loteId: 1, fecha: 1 }, {}],
  ["movimientos", { entregaId: 1 }, {}],
  ...["donaciones", "entregas"].flatMap(c => [
    [c, { estado: 1 }, {}],
    [c, { registradaPor: 1, estado: 1 }, {}],
    [c, { claveOperacion: 1 }, { unique: true, partialFilterExpression: { claveOperacion: { $type: "string" } } }]
  ])
].map(([coleccion, key, options], i) => ({ coleccion, key, options: { name: "bab_v2_" + i, ...options } }));

module.exports = { COLECCIONES, construirPlan, validadores, indices, id, copia };
