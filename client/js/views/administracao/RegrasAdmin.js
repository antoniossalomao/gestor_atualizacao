import { html } from "../../utils/html.js";
import { cabecalhoSecao } from "../../templates/secao.js";
import { linhaRegraNumero, rodapeFormulario } from "../../templates/administracao.js";
import { FormularioRegras } from "./FormularioRegras.js";

/**
 * Aba "Regras da equipe": os números que mudam o que TODO MUNDO vê.
 *
 * Duas delas antes nem eram ajustáveis (os 60 dias de "desatualizado" e as
 * 10 cópias de backup estavam fixos no código), e a de arquivar tarefa
 * estava no .env, misturada com a chave dos agentes numa tela chamada
 * "Configuração da API".
 */
export class RegrasAdmin extends FormularioRegras {
  nomes = ["desatualizadoDias", "agendamentoArquivarDias", "backupsManter"];

  desenhar({ valores, definicoes }) {
    const d = definicoes;
    this.container.innerHTML = html`
      ${cabecalhoSecao({
        titulo: "Regras da equipe",
        descricao: "Valem para todas as contas, na hora em que você salva. Cada mudança fica no Histórico.",
      })}
      <form class="card secao-card admin-form" data-role="form" novalidate>
        ${linhaRegraNumero({
          nome: "desatualizadoDias",
          titulo: "Cliente desatualizado depois de",
          ajuda: "Sem nenhuma atualização registrada por mais que isso, o cliente entra na lista de parados do Resumo.",
          unidade: "dias",
          valor: valores.desatualizadoDias,
          min: d.desatualizadoDias.min,
          max: d.desatualizadoDias.max,
        })}
        ${linhaRegraNumero({
          nome: "agendamentoArquivarDias",
          titulo: "Arquivar tarefa concluída depois de",
          ajuda: "Some do quadro de Agendamentos, mas continua no filtro \"Arquivadas\" e nas contas do Resumo.",
          unidade: "dias",
          valor: valores.agendamentoArquivarDias,
          min: d.agendamentoArquivarDias.min,
          max: d.agendamentoArquivarDias.max,
        })}
        ${linhaRegraNumero({
          nome: "backupsManter",
          titulo: "Cópias automáticas do banco",
          ajuda: "Uma cópia é feita a cada vez que o servidor liga. As mais antigas que isso são apagadas.",
          unidade: "cópias",
          valor: valores.backupsManter,
          min: d.backupsManter.min,
          max: d.backupsManter.max,
        })}
        ${rodapeFormulario()}
      </form>`;
  }
}
