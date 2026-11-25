// Ejecutar mediante load() en mongosh independiente, abierto desde PowerShell/Terminal.
// La consola integrada de Compass del proyecto no admite load().
// Por defecto SOLO REVISA. Ver docs/01-subir-a-atlas.md.
// Mantener await dentro de la función para aceptar consolas que cargan scripts.
(async function () {
  const fs = require("node:fs");
  const path = require("node:path");
  const crypto = require("node:crypto");
  const DB = "bab_donaciones";
  const modo = globalThis.BAB_MODO || "revisar";
  const raiz = globalThis.BAB_RUTA;
  let ficheroEstado;
  function exigir(condicion, mensaje) {
    if (!condicion) {
      const e = new Error(mensaje);
      e.mensajeSeguro = true;
      throw e;
    }
  }
  async function consultar(operacion, accion) {
    try {
      return await accion();
    } catch (error) {
      error.operacionBab = operacion;
      throw error;
    }
  }
  function canonico(valor) {
    const plano = JSON.parse(EJSON.stringify(valor, null, 0, { relaxed: false }));
    function ordenar(x) {
      if (Array.isArray(x)) return x.map(ordenar);
      if (x && typeof x === "object") {
        return Object.fromEntries(Object.keys(x).sort().map(k => [k, ordenar(x[k])]));
      }
      return x;
    }
    return JSON.stringify(ordenar(plano));
  }
  function huella(datos) {
    return crypto.createHash("sha256").update(canonico(datos)).digest("hex");
  }
  function estado(fase, datos = {}) {
    if (ficheroEstado) fs.writeFileSync(ficheroEstado,
      JSON.stringify({ base: DB, fase, fecha: new Date().toISOString(), ...datos }, null, 2), "utf8");
    print(fase);
  }
  try {
    exigir(raiz && path.isAbsolute(raiz), "Define BAB_RUTA con la ruta absoluta de BancoAlimentos_Proyectos.");
    exigir(["revisar", "aplicar", "revertir"].includes(modo), "BAB_MODO debe ser revisar, aplicar o revertir.");
    const modelo = require(path.join(raiz, "db", "migraciones", "modelo-v2.cjs"));
    const bd = db.getSiblingDB(DB);
    const { COLECCIONES, construirPlan, validadores, indices } = modelo;
    async function documentos(base) {
      const resultado = {};
      for (const c of COLECCIONES) {
        const lista = await consultar("find:" + c,
          () => base.getCollection(c).find({}).sort({ _id: 1 }).limit(10001).toArray());
        exigir(lista.length <= 10000, "Esta migración académica admite como máximo 10000 documentos por colección.");
        resultado[c] = lista;
      }
      return resultado;
    }
    async function metadatos() {
      // Atlas del proyecto rechaza $in en listCollections con el código 8000.
      // Leer las opciones completas y seleccionar las ocho colecciones localmente.
      const infos = (await consultar("listCollections", () => bd.getCollectionInfos()))
        .filter(i => COLECCIONES.includes(i.name));
      exigir(COLECCIONES.every(c => infos.some(i => i.name === c && i.type === "collection")),
        "Deben existir las ocho colecciones de negocio en bab_donaciones.");
      const resultado = {};
      for (const c of COLECCIONES) {
        resultado[c] = {
          options: infos.find(i => i.name === c).options,
          indexes: await consultar("listIndexes:" + c, () => bd.getCollection(c).getIndexes())
        };
      }
      return resultado;
    }
    async function archivos() {
      return await consultar("find:fs.files", () => bd.getCollection("fs.files").find({}).sort({ _id: 1 }).toArray());
    }
    function firmaIndice(i) {
      return canonico({
        key: i.key, unique: Boolean(i.unique), sparse: Boolean(i.sparse),
        partialFilterExpression: i.partialFilterExpression || null, collation: i.collation || null
      });
    }
    function indicesPendientes(meta) {
      const pendientes = [];
      for (const spec of indices) {
        const existentes = meta[spec.coleccion].indexes;
        const deseado = { key: spec.key, ...spec.options };
        if (existentes.some(i => firmaIndice(i) === firmaIndice(deseado))) continue;
        exigir(!existentes.some(i => i.name === spec.options.name),
          "Conflicto con el nombre del índice " + spec.options.name);
        exigir(!existentes.some(i => canonico(i.key) === canonico(spec.key)),
          "Existe un índice de los mismos campos con otras opciones en " + spec.coleccion + ". Revisarlo antes de continuar.");
        pendientes.push(spec);
      }
      return pendientes;
    }
    async function instalar(reglas, opciones = {}) {
      for (const c of COLECCIONES) {
        const extra = opciones[c] || {};
        const r = await consultar("collMod:" + c, () => bd.runCommand({
          collMod: c, validator: reglas[c],
          validationLevel: extra.validationLevel || "strict",
          validationAction: extra.validationAction || "error"
        }));
        exigir(r.ok === 1, "No se pudo modificar el validador de " + c);
      }
    }
    function ampliados(meta) {
      return Object.fromEntries(COLECCIONES.map(c => [c, {
        $or: [meta[c].options.validator || {}, validadores[c]]
      }]));
    }
    async function reemplazar(esperados, nuevos, archivosEsperados, comprobarEsquema) {
      const sesion = await db.getMongo().startSession();
      try {
        await sesion.startTransaction({
          readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }
        });
        const transaccion = sesion.getDatabase(DB);
        exigir(huella(await documentos(transaccion)) === huella(esperados),
          "Los datos cambiaron desde la revisión. No se sobrescribirá trabajo ajeno.");
        const archivosActuales = await transaccion.getCollection("fs.files").find({}).sort({ _id: 1 }).toArray();
        exigir(huella(archivosActuales) === huella(archivosEsperados),
          "Los archivos cambiaron durante la migración.");
        for (const c of COLECCIONES) {
          const antes = new Map(esperados[c].map(d => [modelo.id(d._id), d]));
          for (const d of nuevos[c]) {
            if (canonico(d) === canonico(antes.get(modelo.id(d._id)))) continue;
            const r = await transaccion.getCollection(c).replaceOne({ _id: d._id }, d);
            exigir(r.matchedCount === 1, "Un documento desapareció durante la migración.");
          }
        }
        if (comprobarEsquema) {
          for (const c of COLECCIONES) {
            const invalidos = await transaccion.getCollection(c).countDocuments({ $nor: [validadores[c]] });
            exigir(invalidos === 0, c + ": " + invalidos + " documentos incumplen el modelo nuevo. Se aborta la transacción.");
          }
        }
        await sesion.commitTransaction();
      } catch (error) {
        try { await sesion.abortTransaction(); } catch (_) {}
        throw error;
      } finally {
        await sesion.endSession();
      }
    }
    if (modo === "revertir") {
      exigir(globalThis.BAB_RESPALDO && path.isAbsolute(globalThis.BAB_RESPALDO),
        "Define BAB_RESPALDO con la ruta exacta del respaldo generado al aplicar.");
      const respaldo = EJSON.parse(fs.readFileSync(globalThis.BAB_RESPALDO, "utf8"));
      exigir(respaldo.base === DB && respaldo.version === 2, "El respaldo no pertenece a esta migración.");
      const actuales = await documentos(bd), meta = await metadatos(), files = await archivos();
      exigir(huella(actuales) === huella(respaldo.despues) || huella(actuales) === huella(respaldo.antes),
        "Hay operaciones posteriores o diferencias con el respaldo. Reversión automática bloqueada.");
      exigir(huella(files) === huella(respaldo.archivos), "Hay cambios posteriores en archivos. Reversión bloqueada.");
      const union = ampliados(respaldo.metadatos);
      for (const c of COLECCIONES) {
        const actual = meta[c].options.validator || {};
        const permitidos = [respaldo.metadatos[c].options.validator || {}, validadores[c], union[c]];
        exigir(permitidos.some(v => canonico(v) === canonico(actual)),
          "El validador de " + c + " fue cambiado por otro proceso.");
        for (const indice of meta[c].indexes) {
          const previo = respaldo.metadatos[c].indexes.find(i => i.name === indice.name);
          const creado = respaldo.indicesNuevos.find(i => i.coleccion === c && i.options.name === indice.name);
          exigir((previo && firmaIndice(previo) === firmaIndice(indice)) ||
            (creado && firmaIndice({ key: creado.key, ...creado.options }) === firmaIndice(indice)),
            "Se detectó un índice ajeno o modificado en " + c + ". Reversión bloqueada.");
        }
        exigir(respaldo.metadatos[c].indexes.every(i => meta[c].indexes.some(a => a.name === i.name)),
          "Falta un índice previo en " + c + ". Revisión manual necesaria.");
      }
      ficheroEstado = globalThis.BAB_RESPALDO + ".estado.json";
      await instalar(union);
      await reemplazar(actuales, respaldo.antes, files, false);
      await instalar(Object.fromEntries(COLECCIONES.map(c => [c, respaldo.metadatos[c].options.validator || {}])),
        Object.fromEntries(COLECCIONES.map(c => [c, respaldo.metadatos[c].options])));
      for (const spec of respaldo.indicesNuevos) {
        const presentes = await bd.getCollection(spec.coleccion).getIndexes();
        if (presentes.some(i => i.name === spec.options.name)) {
          await bd.getCollection(spec.coleccion).dropIndex(spec.options.name);
        }
      }
      exigir(huella(await documentos(bd)) === huella(respaldo.antes), "No coincide la restauración con el respaldo.");
      estado("REVERTIDA");
      globalThis.BAB_ULTIMO_RESULTADO = { ok: true, modo };
      return;
    }
    const meta = await metadatos(), antes = await documentos(bd), files = await archivos();
    const plan = construirPlan(antes, files);
    const nuevosIndices = indicesPendientes(meta);
    print("Base única: " + DB + ". Modo: " + modo + ".");
    printjson({
      documentos: Object.fromEntries(COLECCIONES.map(c => [c, antes[c].length])),
      documentosPorActualizar: plan.cambios.length,
      indicesPorCrear: nuevosIndices.length,
      entregas: plan.datos.entregas.map(e => ({ codigo: e.codigo, estado: e.estado })),
      reservas: plan.datos.lotes.map(l => ({
        codigo: l.codigo, enBodega: l.cantidadEnBodega, reservado: l.cantidadReservada, zona: l.zona
      })),
      avisos: plan.avisos, errores: plan.errores
    });
    exigir(plan.errores.length === 0, "Resolver los errores de la revisión antes de aplicar.");
    if (modo === "revisar") {
      globalThis.BAB_ULTIMO_RESULTADO = { ok: true, modo, errores: 0 };
      print("REVISIÓN TERMINADA. No se escribió en MongoDB ni se generó un respaldo.");
      return;
    }
    const dir = path.join(raiz, "db", "respaldos");
    fs.mkdirSync(dir, { recursive: true });
    const fichero = path.join(dir, "bab-v2-" + new Date().toISOString().replace(/[:.]/g, "-") + "-" + crypto.randomBytes(3).toString("hex") + ".ejson");
    const respaldo = {
      version: 2, base: DB, fecha: new Date(), antes, despues: plan.datos,
      archivos: files, metadatos: meta, indicesNuevos: nuevosIndices
    };
    fs.writeFileSync(fichero, EJSON.stringify(respaldo, null, 2, { relaxed: false }), { encoding: "utf8", flag: "wx" });
    ficheroEstado = fichero + ".estado.json";
    print("Respaldo local: " + fichero);
    estado("RESPALDADA");
    await instalar(ampliados(meta));
    estado("VALIDADORES_AMPLIADOS");
    await reemplazar(antes, plan.datos, files, true);
    estado("DATOS_CONFIRMADOS");
    for (const spec of nuevosIndices) await bd.getCollection(spec.coleccion).createIndex(spec.key, spec.options);
    estado("INDICES_CREADOS");
    await instalar(validadores);
    const despues = await documentos(bd), comprobacion = construirPlan(despues, await archivos());
    exigir(huella(despues) === huella(plan.datos), "Los datos finales no coinciden con el plan.");
    exigir(comprobacion.errores.length === 0, "La conciliación final encontró errores.");
    for (const c of COLECCIONES) {
      exigir(await bd.getCollection(c).countDocuments({ $nor: [validadores[c]] }) === 0,
        "Validación final fallida en " + c);
    }
    estado("VERIFICADA");
    globalThis.BAB_ULTIMO_RESULTADO = { ok: true, modo, respaldo: fichero };
    print("MIGRACIÓN VERIFICADA. No se generaron contraseñas ni aprobaciones administrativas.");
  } catch (error) {
    const operacion = error.operacionBab || "migracion";
    const codigo = typeof error.code === "number" || /^[A-Z][A-Z0-9_]*$/.test(error.code || "")
      ? error.code : undefined;
    // Clasificar sin imprimir el error original: puede contener URI, consultas o datos.
    const detalle = String(error.message || "");
    let orientacion = "Revisar la operación indicada, conexión y fase guardada.";
    if (/can.t get regex from filter doc.*not a regex/i.test(detalle)) {
      orientacion = "Atlas rechazó el filtro de listCollections. Usa el ejecutor actualizado que filtra las colecciones localmente.";
    } else if (/not authorized|not allowed to do action|unauthorized/i.test(detalle)) {
      orientacion = operacion.startsWith("collMod:")
        ? "MongoDB denegó el permiso collMod para configurar validadores. Añade dbAdmin sobre bab_donaciones al usuario de conexión en Atlas y conserva su permiso de lectura y escritura."
        : "MongoDB denegó el permiso para esta operación en bab_donaciones.";
    }
    const mensaje = error.mensajeSeguro ? error.message
      : "Error técnico " + (codigo === undefined ? "sin código" : codigo) + " en " + operacion + ". " + orientacion;
    estado("INCOMPLETA", { mensaje, operacion, codigo });
    globalThis.BAB_ULTIMO_RESULTADO = { ok: false, modo, mensaje, operacion, codigo, ficheroEstado };
    print(mensaje);
    if (modo === "revisar") {
      print("REVISIÓN NO COMPLETADA. No se escribió en MongoDB ni se generó un respaldo.");
    } else {
      print("No iniciar la aplicación hasta resolverlo. Conservar el respaldo. No ejecutar seed.js.");
    }
  }
})();
