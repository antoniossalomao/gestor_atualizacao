import { icon } from "../utils/icons.js";

/** De quanto em quanto tempo tentar de novo enquanto o servidor está fora. */
const INTERVALO_MS = 5000;

/**
 * A faixa de "sem conexão com o servidor", no alto da tela.
 *
 * O servidor deste app é um serviço do Windows numa máquina da rede local, e
 * ele reinicia: atualização do Gestor, reboot da máquina, queda do switch.
 * Até agora isso era invisível para quem estava com o app aberto -- a tela
 * continuava mostrando os dados de antes (que é o certo: dado velho é melhor
 * que tela em branco), mas nada dizia que eles tinham parado no tempo. A
 * descoberta vinha pelo pior caminho possível: clicar em "Adicionar" e receber
 * um "não foi possível conectar" que não esclarecia se o problema era daquele
 * registro ou de tudo.
 *
 * A faixa fica enquanto durar o problema, tenta sozinha a cada cinco segundos,
 * e some quando o servidor volta -- levando junto um recarregamento dos dados
 * da tela aberta, porque enquanto ele esteve fora o mundo pode ter mudado.
 *
 * Não é um toast: toast é para o que aconteceu e passou. Isto é um estado que
 * continua valendo, e some sozinho quando deixar de valer.
 */
export class ConexaoBanner {
  /**
   * @param {import('../api/ApiClient').ApiClient} api
   * @param {() => void} aoVoltar chamado quando o servidor responde de novo
   */
  constructor(api, aoVoltar) {
    this.api = api;
    this.aoVoltar = aoVoltar;
    this.el = null;
    this.timer = null;

    this._aoMudar = (e) => (e.detail.online ? this._esconder() : this._mostrar());
    document.addEventListener("conexao:mudou", this._aoMudar);

    /*
     * O navegador avisa na hora em que o cabo sai ou o Wi-Fi cai, sem esperar
     * nenhuma requisição falhar -- e é quase sempre o primeiro a saber. O
     * caminho de volta é o mesmo de sempre: `online` só tenta uma chamada, e
     * quem apaga a faixa é a resposta do servidor, não o palpite do navegador
     * (o Wi-Fi voltar não quer dizer que o servidor esteja de pé).
     */
    // Passa pelo `ApiClient`, e não direto no `_mostrar()`: é ele que guarda o
    // estado da conexão, e uma faixa que aparecesse por fora dele deixaria o
    // cliente se achando online -- aí a primeira resposta boa depois da volta
    // não seria uma troca de estado, não avisaria ninguém, e a faixa ficaria
    // na tela para sempre. Foi exatamente o que aconteceu no teste.
    this._aoCair = () => this.api.marcarOffline();
    this._aoVoltar = () => this._tentar();
    window.addEventListener("offline", this._aoCair);
    window.addEventListener("online", this._aoVoltar);
  }

  _mostrar() {
    if (this.el) return;
    this.el = document.createElement("div");
    this.el.className = "conexao-aviso";
    this.el.setAttribute("role", "status");
    this.el.innerHTML = `
      <span class="conexao-aviso__icone" aria-hidden="true">${icon("alerta")}</span>
      <span class="conexao-aviso__texto">
        <strong>Sem conexão com o servidor.</strong>
        <span data-role="detalhe">Os dados na tela são os últimos que chegaram. Tentando de novo…</span>
      </span>
      <button type="button" class="btn btn--small" data-action="tentar">Tentar agora</button>
    `;
    this.el.querySelector('[data-action="tentar"]').addEventListener("click", () => this._tentar());
    document.body.appendChild(this.el);
    this.timer = setInterval(() => this._tentar(), INTERVALO_MS);
  }

  /**
   * Uma requisição barata qualquer serve de teste -- o que interessa é se o
   * servidor responde. `/auth/status` é a mais barata que existe aqui, e não
   * muda nada do lado de lá.
   *
   * Quem apaga a faixa não é este método: é o próprio `ApiClient`, que ao
   * receber resposta dispara `conexao:mudou`. Assim existe um caminho só para
   * "voltou", e ele vale também quando quem descobriu foi outra chamada
   * qualquer feita no meio tempo.
   */
  async _tentar() {
    try {
      await this.api.get("/auth/status");
    } catch {
      /* continua fora: a faixa fica, e o intervalo tenta de novo */
    }
  }

  _esconder() {
    clearInterval(this.timer);
    this.timer = null;
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    this.aoVoltar?.();
  }

  destroy() {
    clearInterval(this.timer);
    this.timer = null;
    this.el?.remove();
    this.el = null;
    document.removeEventListener("conexao:mudou", this._aoMudar);
    window.removeEventListener("offline", this._aoCair);
    window.removeEventListener("online", this._aoVoltar);
  }
}
