import test from "node:test";
import assert from "node:assert/strict";
import { Roteador } from "../js/app/Roteador.js";

test("hash malformado cai na rota inicial sem interromper o login", () => {
  const originais = { window: globalThis.window, location: globalThis.location, history: globalThis.history };
  let rota;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.location = { hash: "#/%" };
  globalThis.history = { replaceState(_s, _t, hash) { globalThis.location.hash = hash; } };
  const roteador = new Roteador(["resumo", "clientes"], (r) => (rota = r));
  try {
    assert.equal(roteador.atual(), null);
    roteador.iniciar("resumo");
    assert.equal(rota, "resumo");
    globalThis.location.hash = "#/%63lientes";
    assert.equal(roteador.atual(), "clientes");
  } finally { roteador.destroy(); Object.assign(globalThis, originais); }
});
