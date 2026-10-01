import { Modal } from "./Modal.js";
import { ErroApi } from "../api/ApiPainel.js";
import { escolherArquivo } from "./arquivos.js";
import { comBotaoOcupado } from "./botaoOcupado.js";
import { orientacaoImportacao, previaImportacao, resultadoImportacao } from "../templates/importacao.js";

/**
 * Importação de planilha em três passos: orientação do formato, prévia (o
 * servidor lê e classifica sem gravar) e resultado.
 *
 * Antes era "escolher arquivo -> confirmar -> gravar", e o que dava errado só
 * aparecia depois de gravado: datas em outro formato entravam, o mesmo
 * arquivo enviado duas vezes duplicava o histórico, e uma falha no meio
 * deixava parte do lote dentro. Agora nada é gravado sem a pessoa ver antes
 * o que vai entrar e o que fica de fora.
 *
 * Aberto pelo menu "Mais ações" de Atualizações (operador e admin, as mesmas
 * pessoas que o servidor deixa importar) e pela seção Dados da Administração.
 */
export class ImportacaoModal {
  /**
   * @param {import('../api/ApiPainel').ApiPainel} api
   * @param {{aoImportar?: (resultado: any) => void}} [opcoes]
   */
  constructor(api, { aoImportar = () => {} } = {}) {
    this.api = api;
    this.aoImportar = aoImportar;
    this.arquivo = null;
    this.previa = null;
    this.pularDuplicadas = true;
  }

  open() {
    const { box, close } = Modal.abrirCaixa({ largura: 720, classe: "importacao" });
    this.box = box;
    this.close = close;
    box.setAttribute("aria-labelledby", "importacao-titulo");
    box.addEventListener("click", (e) => this._clique(e));
    box.addEventListener("change", (e) => {
      const alvo = /** @type {HTMLInputElement} */ (e.target);
      if (alvo.dataset.role === "pular-duplicadas") {
        this.pularDuplicadas = alvo.checked;
        this._mostrar(previaImportacao(this.previa, this.arquivo.name, this.pularDuplicadas));
      }
    });
    this._mostrar(orientacaoImportacao());
  }

  _mostrar(marcacao) {
    this.box.innerHTML = String(marcacao);
    /** @type {HTMLElement|null} */ (this.box.querySelector(".btn--accent:not([disabled])") || this.box.querySelector("button"))?.focus();
  }

  async _clique(e) {
    const botao = /** @type {HTMLButtonElement|null} */ (e.target.closest("button[data-action]"));
    if (!botao) return;
    const acao = botao.dataset.action;
    if (acao === "fechar") return this.close();
    if (acao === "escolher") return this._escolher(botao);
    if (acao === "importar") return comBotaoOcupado(botao, () => this._importar())();
  }

  async _escolher(botao) {
    const arquivo = await escolherArquivo({ accept: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    if (!arquivo) return;
    await comBotaoOcupado(botao, async () => {
      try {
        this.previa = await this.api.enviarArquivo("/atualizacoes/import/previa", arquivo);
        this.arquivo = arquivo;
        this._mostrar(previaImportacao(this.previa, arquivo.name, this.pularDuplicadas));
      } catch (err) {
        Modal.alert("Não foi possível ler a planilha", mensagem(err), "error");
      }
    })();
  }

  async _importar() {
    const form = new FormData();
    form.append("arquivo", this.arquivo);
    form.append("pularDuplicadas", this.pularDuplicadas ? "1" : "0");
    try {
      const resultado = await this.api.enviarFormulario("/atualizacoes/import", form);
      this._mostrar(resultadoImportacao(resultado));
      this.aoImportar(resultado);
    } catch (err) {
      // A importação é uma transação só: falhou, não entrou nada. Dizer isso
      // evita a pessoa reenviar achando que metade já está lá (ou o contrário).
      Modal.alert("A importação não foi feita", `${mensagem(err)}\n\nNenhuma linha foi gravada.`, "error");
    }
  }
}

function mensagem(err) {
  return err instanceof ErroApi ? err.message : "Ocorreu um erro inesperado.";
}
