/*
 * Configurações > Regras da equipe: os números mostrados a quem não é admin.
 * O que erra em silêncio aqui é mostrar um prazo que não é o da equipe, ou
 * "0 dias" como se fosse um dado faltando.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { formatarDias, resumoRegrasEquipe } from "../js/domain/regrasEquipe.js";

test("Regras da equipe", async (t) => {
  await t.test("dias no singular, no plural e zero; travessão sem valor", () => {
    assert.equal(formatarDias(1), "1 dia");
    assert.equal(formatarDias(45), "45 dias");
    assert.equal(formatarDias(0), "0 dias");
    for (const vazio of [undefined, null, "60", -1, 2.5]) assert.equal(formatarDias(vazio), "—");
  });

  await t.test("cada regra mostra o valor que veio do servidor", () => {
    const porId = Object.fromEntries(
      resumoRegrasEquipe({ prazoVersaoDias: 45, desatualizadoDias: 90, agendamentoArquivarDias: 7, atualizadorHabilitado: false }).map((r) => [r.id, r])
    );
    assert.equal(porId.prazoVersaoDias.valor, "45 dias");
    assert.equal(porId.desatualizadoDias.valor, "90 dias");
    assert.equal(porId.agendamentoArquivarDias.valor, "7 dias");
    assert.equal(porId.atualizadorHabilitado.valor, "Desligado");
  });

  await t.test("prazo 0 explica que não há espera, em vez de falar em \"Aguardando\"", () => {
    const prazo = resumoRegrasEquipe({ prazoVersaoDias: 0 }).find((r) => r.id === "prazoVersaoDias");
    assert.match(prazo.texto, /dia seguinte/);
    assert.doesNotMatch(prazo.texto, /Aguardando/);
  });

  await t.test("sem resposta do servidor, nenhum número inventado", () => {
    for (const r of resumoRegrasEquipe({})) assert.equal(r.valor, "—", r.id);
  });

  await t.test("cada regra aponta para uma aba que existe na Administração", () => {
    for (const r of resumoRegrasEquipe({})) assert.ok(["operacao", "integracoes"].includes(r.abaAdmin), r.id);
  });
});
