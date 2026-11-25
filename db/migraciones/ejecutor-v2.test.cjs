"use strict";
// Prueba del control del ejecutor con MongoDB simulado. No verifica el motor
// de validación BSON ni la conectividad con Atlas.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const modelo = require("./modelo-v2.cjs");
const raiz = path.resolve(__dirname, "../..");
// Ejecutar el archivo exacto: no ocultar incompatibilidades de sintaxis de la consola.
const source = fs.readFileSync(path.join(__dirname, "aplicar-v2.mongosh.js"), "utf8");
const ejson = {
  stringify(value, replacer, space) {
    return JSON.stringify(value, function (k, v) {
      return this[k] instanceof Date ? { $date: this[k].toISOString() } : v;
    }, space);
  },
  parse(text) {
    return JSON.parse(text, (k, v) => v && v.$date ? new Date(v.$date) : v);
  }
};
const clone = x => ejson.parse(ejson.stringify(x));
function entorno() {
  let datos = Object.fromEntries(modelo.COLECCIONES.map(c => [c,
    ejson.parse(fs.readFileSync(path.join(raiz, "db/datos", c + ".json"), "utf8"))
  ]));
  datos["fs.files"] = [];
  const original = clone(datos), memoria = new Map(), logs = [];
  const meta = Object.fromEntries(modelo.COLECCIONES.map(c => [
    c, { options: {}, indexes: [{ name: "_id_", key: { _id: 1 } }] }
  ]));
  const control = { escrituras: 0, falloIndice: false, falloEsquema: false, cambioConcurrente: false };
  function base(getter) {
    return {
      getCollection(c) {
        return {
          find() {
            const cursor = {
              sort() { return cursor; }, limit() { return cursor; },
              async toArray() { return clone(getter()[c] || []); }
            };
            return cursor;
          },
          async getIndexes() {
            if (control.errorIndices) throw control.errorIndices;
            return clone(meta[c].indexes);
          },
          async replaceOne(filtro, nuevo) {
            const rows = getter()[c], i = rows.findIndex(d => modelo.id(d._id) === modelo.id(filtro._id));
            if (i < 0) return { matchedCount: 0 };
            rows[i] = clone(nuevo); control.escrituras++;
            return { matchedCount: 1 };
          },
          async countDocuments() { return control.falloEsquema && c === "entregas" ? 1 : 0; },
          async createIndex(key, options) {
            if (control.falloIndice) {
              control.falloIndice = false;
              throw Object.assign(new Error("fallo simulado"), { code: 999 });
            }
            control.escrituras++;
            meta[c].indexes.push(clone({ key, ...options }));
          },
          async dropIndex(nombre) {
            control.escrituras++;
            meta[c].indexes = meta[c].indexes.filter(i => i.name !== nombre);
          }
        };
      },
      async getCollectionInfos(filtro = {}) {
        // Rechazo observado en el clúster Atlas del proyecto; no es un fallo de permisos.
        if (filtro.name && filtro.name.$in) {
          throw Object.assign(new Error("can't get regex from filter doc not a regex"), {
            code: 8000, codeName: "AtlasError"
          });
        }
        return Object.entries(meta).map(([name, v]) => ({ name, type: "collection", options: clone(v.options) }));
      },
      async runCommand(cmd) {
        assert(Object.hasOwn(cmd, "collMod"));
        if (control.denegarCollMod) {
          throw Object.assign(new Error("user is not allowed to do action [collMod]"), { code: 8000 });
        }
        control.escrituras++;
        meta[cmd.collMod].options = {
          validator: clone(cmd.validator),
          validationLevel: cmd.validationLevel, validationAction: cmd.validationAction
        };
        return { ok: 1 };
      }
    };
  }
  const db = {
    getSiblingDB(nombre) { assert.equal(nombre, "bab_donaciones"); return base(() => datos); },
    getMongo() {
      return {
        startSession() {
          let staged;
          return {
            startTransaction() {
              if (control.cambioConcurrente) datos.donantes[0].nombre = "Cambio ajeno";
              staged = clone(datos);
            },
            getDatabase(nombre) { assert.equal(nombre, "bab_donaciones"); return base(() => staged); },
            commitTransaction() { datos = staged; }, abortTransaction() {}, endSession() {}
          };
        }
      };
    }
  };
  const ctx = vm.createContext({
    db, EJSON: ejson, Date,
    BAB_RUTA: raiz,
    print: x => logs.push(x), printjson: x => logs.push(x),
    require(nombre) {
      if (nombre === "node:fs") return {
        mkdirSync() {},
        writeFileSync(file, content, options) {
          if (options && options.flag === "wx") assert(!memoria.has(file));
          memoria.set(file, content);
        },
        readFileSync(file) { assert(memoria.has(file)); return memoria.get(file); }
      };
      if (nombre.endsWith("modelo-v2.cjs")) return modelo;
      return require(nombre);
    }
  });
  return {
    control, memoria, meta, original, logs,
    datos: () => datos,
    async run(modo, respaldo) {
      ctx.BAB_MODO = modo; ctx.BAB_RESPALDO = respaldo;
      await vm.runInContext(source, ctx);
      return ctx.BAB_ULTIMO_RESULTADO;
    }
  };
}
test("los ejemplos de la guía se pueden analizar como scripts sin modo módulo", () => {
  const guia = fs.readFileSync(path.join(raiz, "docs/01-subir-a-atlas.md"), "utf8");
  const bloques = [...guia.matchAll(/~~~javascript\r?\n([\s\S]*?)\r?\n~~~/g)];
  assert(bloques.length > 0);
  for (const [, codigo] of bloques) {
    assert.doesNotThrow(() => new vm.Script(codigo));
  }
});
test("revisar es el modo predeterminado y no escribe en base ni disco", async () => {
  const e = entorno(), r = await e.run(undefined);
  assert.equal(r.ok, true);
  assert.equal(e.control.escrituras, 0);
  assert.equal(e.memoria.size, 0);
  assert.deepEqual(e.datos(), e.original);
});
test("revisar funciona en Atlas cuando listCollections rechaza filtros con $in", async () => {
  const e = entorno(), r = await e.run("revisar");
  assert.equal(r.ok, true);
  const resumen = e.logs.find(x => x && typeof x === "object" && x.documentos);
  assert.equal(Object.keys(resumen.documentos).length, 8);
  assert.equal(e.control.escrituras, 0);
  assert.equal(e.memoria.size, 0);
});
test("un fallo de lectura identifica la operación sin imprimir credenciales ni hashes", async () => {
  const e = entorno();
  e.control.errorIndices = Object.assign(new Error(
    "user is not allowed to do action [listIndexes]; mongodb+srv://usuario:claveSecreta@servidor/; passwordHash=hashSecreto"
  ), { code: 8000 });
  const r = await e.run("revisar");
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 8000);
  assert.equal(r.operacion, "listIndexes:voluntarios");
  assert.match(r.mensaje, /permiso/i);
  const salida = JSON.stringify({ r, logs: e.logs });
  assert(!/claveSecreta|hashSecreto|mongodb\+srv/.test(salida));
  assert.equal(e.control.escrituras, 0);
  assert.equal(e.memoria.size, 0);
});
test("un permiso collMod faltante identifica la colección y conserva respaldo y datos", async () => {
  const e = entorno();
  e.control.denegarCollMod = true;
  const r = await e.run("aplicar");
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 8000);
  assert.equal(r.operacion, "collMod:voluntarios");
  assert.match(r.mensaje, /dbAdmin/);
  assert.equal(e.control.escrituras, 0);
  assert.deepEqual(e.datos(), e.original);
  assert([...e.memoria.keys()].some(nombre => nombre.endsWith(".ejson")));
  assert(e.memoria.has(r.ficheroEstado));
});
test("aplicar conserva cantidades y revertir restaura los datos e índices previos", async () => {
  const e = entorno(), r = await e.run("aplicar");
  assert.equal(r.ok, true);
  assert.equal(e.datos().lotes.find(l => l.codigo === "L-0015").cantidadEnBodega, 200);
  assert.equal(e.datos().lotes.find(l => l.codigo === "L-0015").cantidadReservada, 60);
  assert(e.memoria.has(r.respaldo));
  const vuelta = await e.run("revertir", r.respaldo);
  assert.equal(vuelta.ok, true);
  assert.deepEqual(e.datos(), e.original);
  for (const c of modelo.COLECCIONES) assert.equal(e.meta[c].indexes.length, 1);
});
test("un fallo de índices posterior a la transacción permite reanudar sin duplicar reservas", async () => {
  const e = entorno();
  e.control.falloIndice = true;
  assert.equal((await e.run("aplicar")).ok, false);
  assert.equal(e.datos().lotes.find(l => l.codigo === "L-0015").cantidadReservada, 60);
  assert.equal((await e.run("aplicar")).ok, true);
  assert.equal(e.datos().lotes.find(l => l.codigo === "L-0015").cantidadReservada, 60);
});
test("un documento que incumple el validador aborta todos los reemplazos", async () => {
  const e = entorno();
  e.control.falloEsquema = true;
  assert.equal((await e.run("aplicar")).ok, false);
  assert.deepEqual(e.datos(), e.original);
});
test("un cambio concurrente se conserva y detiene la migración", async () => {
  const e = entorno();
  e.control.cambioConcurrente = true;
  assert.equal((await e.run("aplicar")).ok, false);
  assert.equal(e.datos().donantes[0].nombre, "Cambio ajeno");
  assert(e.datos().lotes.every(l => !l.modeloVersion));
});
test("no permite revertir por encima de operaciones posteriores", async () => {
  const e = entorno(), r = await e.run("aplicar");
  e.datos().donantes[0].nombre = "Cambio posterior";
  const antes = clone(e.datos());
  assert.equal((await e.run("revertir", r.respaldo)).ok, false);
  assert.deepEqual(e.datos(), antes);
});
