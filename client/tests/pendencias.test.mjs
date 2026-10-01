/*
 * Alterações não salvas (utils/pendencias.js): o que erra em silêncio é o
 * aviso não aparecer -- uma fonte esquecida registrada, ou uma que quebrou e
 * calou as outras.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { RegistroDePendencias } from "../js/utils/pendencias.js";

test("Registro de pendências", async (t) => {
  await t.test("lista só o que está pendente, sem repetir", () => {
    const r = new RegistroDePendencias();
    r.registrar(() => "Operação: 1 alteração não salva");
    r.registrar(() => null);
    r.registrar(() => "Operação: 1 alteração não salva");
    assert.deepEqual(r.lista(), ["Operação: 1 alteração não salva"]);
  });

  await t.test("desfazer o registro tira a fonte (a tela foi desmontada)", () => {
    const r = new RegistroDePendencias();
    const desfazer = r.registrar(() => "Minha conta: senha nova digitada");
    desfazer();
    assert.deepEqual(r.lista(), []);
  });

  await t.test("uma fonte quebrada não cala as outras", () => {
    const r = new RegistroDePendencias();
    r.registrar(() => {
      throw new Error("x");
    });
    r.registrar(() => "Integrações: 2 alterações não salvas");
    assert.deepEqual(r.lista(), ["Integrações: 2 alterações não salvas"]);
  });
});
