"use strict";
// Extensión opcional de voluntarios. Mantiene las ocho colecciones de negocio.
const esquemaAutenticacion = {
  $jsonSchema: {
    bsonType: "object",
    properties: {
      sesiones: {
        bsonType: "array", maxItems: 5,
        items: {
          bsonType: "object", required: ["tokenHash", "creadaEn", "expiraEn"],
          properties: {
            tokenHash: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
            creadaEn: { bsonType: "date" }, expiraEn: { bsonType: "date" }
          }
        }
      },
      acceso: {
        bsonType: "object", required: ["intentos", "ventanaDesde"],
        properties: {
          intentos: { bsonType: ["int", "long", "double"], minimum: 0, maximum: 5, multipleOf: 1 },
          ventanaDesde: { bsonType: "date" }
        }
      },
      ultimoAccesoEn: { bsonType: "date" }
    }
  }
};
module.exports = { esquemaAutenticacion };
