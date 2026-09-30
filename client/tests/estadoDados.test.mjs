/*
 * Testes do aviso de dados desatualizados (CHANGELOG de 29/09/2026;
 * utils/EstadoDados.js, usado pela View.swr).
 *
 * O que erra em silêncio se quebrar:
 *  - a falha não avisar → a tela mostra dado velho como se fosse atual, que
 *    era exatamente o defeito;
 *  - avisar cancelamento (troca de filtro, digitação rápida) → erro falso;
 *  - o aviso não sumir depois que a busca volta a dar certo, ou ficar preso
 *    a um filtro que a pessoa já trocou;
 *  - mostrar o horário do dado mais NOVO quando a tela tem dois velhos.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { EstadoDados, descreverFalha, formatarMomento, grupoDaChave } from "../js/utils/EstadoDados.js";

const cancelado = { cancelled: true, name: "RequestCancelled" };
const erro = (status, message = "") => ({ status, message });

test("descreverFalha - separa rede, demora, servidor e recusa", async (t) => {
  await t.test("cancelamento e sessão expirada não são avisados na tela", () => {
    assert.equal(descreverFalha(cancelado), null);
    assert.equal(descreverFalha(erro(401, "Não autenticado.")), null);
    assert.equal(descreverFalha(null), null);
  });

  await t.test("sem conexão e painel fora do ar atrás do proxy contam como conexão", () => {
    assert.equal(descreverFalha(erro(0)).tipo, "conexao");
    for (const status of [502, 503, 504]) assert.equal(descreverFalha(erro(status)).tipo, "conexao", String(status));
  });

  await t.test("demora, erro do servidor e recusa têm textos próprios", () => {
    assert.equal(descreverFalha(erro(408)).tipo, "tempo");
    assert.equal(descreverFalha(erro(500, "Erro interno do servidor.")).tipo, "servidor");
    const recusa = descreverFalha(erro(403, "O Atualizador está desativado temporariamente neste servidor."));
    assert.equal(recusa.tipo, "recusa");
    assert.match(recusa.texto, /Atualizador está desativado/, "a recusa usa a mensagem do servidor, que diz o porquê");
  });

  await t.test("erro que não veio do servidor (bug ao desenhar) não se passa por falha de rede", () => {
    assert.equal(descreverFalha(new TypeError("x is undefined")).tipo, "inesperado");
  });
});

test("grupoDaChave - trocar o filtro não troca o lugar na tela", () => {
  assert.equal(grupoDaChave("clientes:lista:abc|1|nome|asc"), "clientes:lista");
  assert.equal(grupoDaChave("clientes:lista:a:b|1"), "clientes:lista", "busca com dois-pontos");
  assert.equal(grupoDaChave("campanhas:detalhe:7"), "campanhas:detalhe");
  assert.equal(grupoDaChave("clientes:grupos"), "clientes:grupos");
  assert.equal(grupoDaChave("resumo"), "resumo");
});

test("formatarMomento - hoje, ontem ou a data", () => {
  const agora = new Date(2026, 8, 29, 16, 0).getTime();
  assert.equal(formatarMomento(new Date(2026, 8, 29, 14, 32).getTime(), agora), "hoje às 14:32");
  assert.equal(formatarMomento(new Date(2026, 8, 28, 9, 5).getTime(), agora), "ontem às 09:05");
  assert.equal(formatarMomento(new Date(2026, 8, 20, 23, 59).getTime(), agora), "20/09 às 23:59");
  assert.equal(formatarMomento(new Date(2026, 9, 1, 8, 0).getTime(), new Date(2026, 9, 2, 8, 0).getTime()), "ontem às 08:00", "virada de mês");
});

test("EstadoDados - o aviso da tela", async (t) => {
  const AS_14_32 = new Date(2026, 8, 29, 14, 32).getTime();
  const AGORA = new Date(2026, 8, 29, 15, 0).getTime();

  await t.test("sem falha, sem aviso", () => {
    const e = new EstadoDados();
    e.sucesso("resumo", AS_14_32);
    assert.equal(e.aviso(AGORA), null);
  });

  await t.test("falha com dado anterior: diz de quando é o dado e por que não atualizou", () => {
    const e = new EstadoDados();
    e.sucesso("resumo", AS_14_32);
    assert.equal(e.falhou("resumo", erro(0), AGORA), true);
    const aviso = e.aviso(AGORA);
    assert.equal(aviso.semDados, false);
    assert.match(aviso.titulo, /Mostrando os dados de hoje às 14:32/);
    assert.equal(aviso.detalhe, "Sem conexão com o servidor.");
  });

  await t.test("dado mostrado do cache conta como o dado da tela, e não apaga a falha", () => {
    const e = new EstadoDados();
    e.exibido("resumo", AS_14_32);
    e.falhou("resumo", erro(500), AGORA);
    e.exibido("resumo", AS_14_32); // nova tentativa: o cache é desenhado de novo
    assert.match(e.aviso(AGORA).titulo, /14:32/, "o aviso não pisca a cada revalidação");
  });

  await t.test("falha sem dado nenhum: 'não foi possível carregar'", () => {
    const e = new EstadoDados();
    e.falhou("resumo", erro(408), AGORA);
    const aviso = e.aviso(AGORA);
    assert.equal(aviso.semDados, true);
    assert.match(aviso.titulo, /Não foi possível carregar/);
    assert.equal(aviso.tipo, "tempo");
  });

  await t.test("a busca voltar a dar certo tira o aviso", () => {
    const e = new EstadoDados();
    e.sucesso("resumo", AS_14_32);
    e.falhou("resumo", erro(0), AGORA);
    e.sucesso("resumo", AGORA);
    assert.equal(e.aviso(AGORA), null);
  });

  await t.test("cancelamento não avisa nem apaga uma falha real", () => {
    const e = new EstadoDados();
    assert.equal(e.falhou("clientes:lista:a", cancelado, AGORA), false);
    assert.equal(e.aviso(AGORA), null);
    e.sucesso("clientes:lista:", AS_14_32);
    e.falhou("clientes:lista:ab", erro(0), AGORA);
    e.falhou("clientes:lista:abc", cancelado, AGORA);
    assert.ok(e.aviso(AGORA), "a falha de verdade continua avisada");
  });

  await t.test("falhou com um filtro e deu certo com outro: a tabela está em dia, sem aviso", () => {
    const e = new EstadoDados();
    e.falhou("clientes:lista:abc|1", erro(500), AGORA);
    e.sucesso("clientes:lista:|1", AGORA);
    assert.equal(e.aviso(AGORA), null);
  });

  await t.test("duas partes da tela falhando: vale o dado mais velho e o motivo mais recente", () => {
    const e = new EstadoDados();
    e.sucesso("clientes:lista:|1", AS_14_32);
    e.sucesso("clientes:grupos", new Date(2026, 8, 29, 14, 50).getTime());
    e.falhou("clientes:grupos", erro(500), AGORA - 1000);
    e.falhou("clientes:lista:|1", erro(0), AGORA);
    const aviso = e.aviso(AGORA);
    assert.match(aviso.titulo, /14:32/);
    assert.equal(aviso.detalhe, "Sem conexão com o servidor.");
  });

  await t.test("uma parte que nunca carregou faz o aviso dizer 'não foi possível carregar'", () => {
    const e = new EstadoDados();
    e.sucesso("clientes:lista:|1", AS_14_32);
    e.falhou("clientes:lista:|1", erro(0), AGORA);
    e.falhou("clientes:grupos", erro(0), AGORA);
    assert.equal(e.aviso(AGORA).semDados, true);
  });

  await t.test("uma parte que dá certo não apaga a falha de outra parte", () => {
    const e = new EstadoDados();
    e.sucesso("distribuicao:painel", AS_14_32);
    e.falhou("distribuicao:painel", erro(503), AGORA);
    e.sucesso("sistemas", AGORA);
    assert.ok(e.aviso(AGORA));
  });
});
