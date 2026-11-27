import assert from "node:assert/strict";
import { test } from "node:test";
import { origenPermitido } from "../src/lib/auth/origin";

const local = new URL("http://localhost:3000");

test("el acceso local acepta localhost y la dirección que anuncia Next", () => {
  for (const configurado of [local, new URL("http://127.0.0.1:3000")]) {
    for (const origen of ["http://localhost:3000", "http://127.0.0.1:3000"]) {
      assert.equal(origenPermitido(origen, configurado), true, origen);
    }
  }
});

test("la excepción local conserva el puerto y el protocolo configurados", () => {
  for (const origen of ["http://localhost:3001", "http://127.0.0.1:3001", "http://localhost", "http://127.0.0.1", "https://localhost:3000", "https://127.0.0.1:3000"]) {
    assert.equal(origenPermitido(origen, local), false, origen);
  }
  const https = new URL("https://localhost:3443");
  assert.equal(origenPermitido("https://127.0.0.1:3443", https), true);
  assert.equal(origenPermitido("http://127.0.0.1:3443", https), false);
});

test("los orígenes externos y nombres parecidos siguen rechazados", () => {
  for (const origen of ["https://otro.example", "http://localhost.otro.example:3000", "http://127.0.0.1.otro.example:3000", "http://192.168.1.2:3000", "http://0.0.0.0:3000", "http://localhost:3000@otro.example", "http://otro.example@127.0.0.1:3000"]) {
    assert.equal(origenPermitido(origen, local), false, origen);
  }
});

test("un Origin ausente, null, múltiple o mal formado no autoriza la solicitud", () => {
  for (const origen of [null, "", "null", "localhost:3000", "http://127.0.0.1:3000/ruta", "http://127.0.0.1:3000/", "http://127.0.0.1:3000?x=1", "http://localhost:3000 http://127.0.0.1:3000", "file://localhost", "http://["]) {
    assert.equal(origenPermitido(origen, local), false, String(origen));
  }
});

test("un despliegue público acepta exclusivamente el origen de APP_URL", () => {
  const publico = new URL("https://banco.example");
  assert.equal(origenPermitido("https://banco.example", publico), true);
  for (const origen of ["http://localhost:3000", "http://127.0.0.1:3000", "https://localhost", "https://127.0.0.1", "http://banco.example", "https://banco.example:444", "https://sub.banco.example", "https://banco.example.otro.example"]) {
    assert.equal(origenPermitido(origen, publico), false, origen);
  }
});
