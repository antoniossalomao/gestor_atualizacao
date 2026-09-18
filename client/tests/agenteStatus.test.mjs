import test from "node:test";
import assert from "node:assert/strict";
import { agruparRetornos, classificarRetorno } from "../js/domain/agenteStatus.js";
import { analisarRetorno } from "../js/domain/agenteReport.js";

test("resultado SUCESSO com scripts pulados exige revisão", () => {
  const resultado = classificarRetorno({
    status: "SUCESSO",
    fase: "concluido",
    detalhes: "Atualização concluída com 87 script(s) pulado(s) por erro -- ver detalhes nos retornos individuais.",
  });
  assert.equal(resultado.tipo, "pendencias");
  assert.equal(resultado.label, "Concluída com pendências");
  assert.equal(resultado.scriptsPulados, 87);
  assert.equal(classificarRetorno({ status: "SUCESSO", detalhes: "2 scripts pulados por erro" }).tipo, "pendencias");
  assert.equal(classificarRetorno({ status: "SUCESSO", detalhes: "1 script pulado por erro" }).scriptsPulados, 1);
  assert.equal(classificarRetorno({ status: "SUCESSO", detalhes: "0 script(s) pulado(s) por erro" }).tipo, "sucesso");
  assert.equal(analisarRetorno({ detalhes: "Atualização concluída com 1 script(s) pulado(s) por erro" }).resumo,
    "1 script falhou e ficou pendente para uma nova tentativa.");
});

test("resultado atual diferencia falha, conclusão, autorização e progresso", () => {
  for (const status of ["ERRO", "FALHA", " erro "]) {
    assert.equal(classificarRetorno({ status }).tipo, "erro");
  }
  for (const status of ["OK", "SUCESSO", "ATUALIZADO", "CONCLUIDO", "Concluído"]) {
    assert.equal(classificarRetorno({ status }).tipo, "sucesso");
  }
  assert.equal(classificarRetorno({ status: "PENDENTE" }).tipo, "aguardando");
  assert.equal(classificarRetorno({ status: "EM_ANDAMENTO", fase: "scripts" }).tipo, "andamento");
  assert.equal(classificarRetorno({ status: "ERRO", detalhes: "2 scripts pulados por erro" }).tipo, "erro");
  assert.equal(classificarRetorno({}).tipo, "desconhecido");
});

test("erros históricos ficam disponíveis sem marcar conclusão posterior como falha", () => {
  const logs = [
    { id: 2, cnpj: "C015928", criadoEm: "2026-09-17T12:02:00Z", status: "SUCESSO", detalhes: "Atualização concluída.", sistema: "B_Vendas" },
    { id: 1, cnpj: "C015928", criadoEm: "2026-09-17T12:00:00Z", status: "ERRO", detalhes: "Falha em script", sistema: "B_Vendas" },
  ];
  const [grupo] = agruparRetornos(logs);
  assert.equal(grupo.resultado.tipo, "sucesso");
  assert.equal(grupo.ultimo.id, 2);
  assert.deepEqual(grupo.erros.map((log) => log.id), [1]);
  assert.equal(grupo.avisos.length, 0);
  assert.equal(grupo.logs.length, 2);
});

test("agentes são agrupados por identificador exato e preservam múltiplos sistemas", () => {
  const logs = [
    { id: 1, cnpj: "C015928", sistema: "B_NFe", status: "ERRO" },
    { id: 2, cnpj: "C015928", sistema: "B_Vendas", status: "SUCESSO", detalhes: "1 script(s) pulado(s) por erro" },
    { id: 3, cnpj: "015928", sistema: "B_Vendas", status: "SUCESSO" },
    { id: 4, cnpj: "BREDAS-TESTE", sistema: "B_NFe", status: "PENDENTE" },
  ];
  const grupos = agruparRetornos(logs);
  assert.equal(grupos.length, 3);
  const legado = grupos.find((grupo) => grupo.cnpj === "C015928");
  assert.deepEqual(legado.sistemas, ["B_Vendas", "B_NFe"]);
  assert.equal(legado.resultado.tipo, "pendencias");
  assert.equal(legado.erros.length, 1);
  assert.equal(legado.avisos.length, 1);
  assert.equal(grupos.find((grupo) => grupo.cnpj === "015928").logs.length, 1);
});

test("cronologia prevalece sobre ID de reentrega; ID desempata a mesma data", () => {
  const logs = [
    { id: 99, cnpj: "A", criadoEm: "2026-09-17T12:00:00Z", status: "ERRO" },
    { id: 10, cnpj: "A", criadoEm: "2026-09-17T12:02:00Z", status: "ERRO" },
    { id: 11, cnpj: "A", criadoEm: "2026-09-17T12:02:00Z", status: "SUCESSO" },
    { id: 12, cnpj: "B", criadoEm: "2026-09-17T12:03:00Z", status: "PENDENTE" },
    { id: 100, cnpj: "A", criadoEm: "inválida", status: "ERRO" },
  ];
  const ordemOriginal = logs.map((log) => log.id);
  const grupos = agruparRetornos(logs);
  assert.deepEqual(grupos.map((grupo) => grupo.cnpj), ["B", "A"]);
  assert.deepEqual(grupos[1].logs.map((log) => log.id), [11, 10, 99, 100]);
  assert.equal(grupos[1].resultado.tipo, "sucesso");
  assert.deepEqual(logs.map((log) => log.id), ordemOriginal);
});

test("histórico vazio e retornos sem identificador não juntam clientes desconhecidos", () => {
  assert.deepEqual(agruparRetornos(), []);
  assert.equal(agruparRetornos([{ id: 1 }, { id: 2 }]).length, 2);
});
