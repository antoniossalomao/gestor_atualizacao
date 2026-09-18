/**
 * Controles de paginação (Primeira/Anterior/Próxima/Última + "Página X de Y"
 * + faixa de registros), reaproveitados pelas telas com listas grandes.
 *
 * A primeira versão refazia o `innerHTML` inteiro a cada mudança de página.
 * O efeito colateral era chato de um jeito difícil de nomear: o botão
 * "Próxima" que você acabou de clicar deixava de existir, então o foco caía no
 * `<body>` -- e paginar apertando `Enter` repetidamente (a forma natural de
 * varrer uma lista) simplesmente não funcionava, o segundo `Enter` não ia para
 * lugar nenhum.
 *
 * Agora os nós são criados uma vez e só os rótulos e o estado `disabled`
 * mudam. O botão continua sendo o mesmo elemento, então o foco fica onde
 * estava.
 */
export class Pagination {
  /** @param {HTMLElement} container @param {(page: number) => void} onChange */
  constructor(container, onChange) {
    this.container = container;
    this.onChange = onChange;
    this.page = 1;
    this.pageSize = 50;
    this.total = 0;

    this.container.className = "pagination";
    this.container.innerHTML = `
      <span class="pagination__info" aria-live="polite"></span>
      <div class="pagination__buttons">
        <button type="button" class="btn btn--small" data-action="first" aria-label="Primeira página" title="Primeira página">«</button>
        <button type="button" class="btn btn--small" data-action="prev">Anterior</button>
        <span class="pagination__page"></span>
        <button type="button" class="btn btn--small" data-action="next">Próxima</button>
        <button type="button" class="btn btn--small" data-action="last" aria-label="Última página" title="Última página">»</button>
      </div>
    `;

    this.info = this.container.querySelector(".pagination__info");
    this.pageLabel = this.container.querySelector(".pagination__page");
    this.botoes = {
      first: this.container.querySelector('[data-action="first"]'),
      prev: this.container.querySelector('[data-action="prev"]'),
      next: this.container.querySelector('[data-action="next"]'),
      last: this.container.querySelector('[data-action="last"]'),
    };

    this.botoes.first.addEventListener("click", () => this._go(1));
    this.botoes.prev.addEventListener("click", () => this._go(this.page - 1));
    this.botoes.next.addEventListener("click", () => this._go(this.page + 1));
    this.botoes.last.addEventListener("click", () => this._go(this._totalPaginas()));

    this._render();
  }

  /** Chamado depois de cada busca, com a resposta paginada da API. */
  update({ page, pageSize, total }) {
    this.page = page;
    this.pageSize = pageSize;
    this.total = total;
    this._render();
  }

  _totalPaginas() {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  _render() {
    const totalPages = this._totalPaginas();
    const inicio = this.total === 0 ? 0 : (this.page - 1) * this.pageSize + 1;
    const fim = Math.min(this.total, this.page * this.pageSize);

    this.info.textContent = `${inicio}–${fim} de ${this.total}`;
    this.pageLabel.textContent = `Página ${this.page} de ${totalPages}`;

    const noComeco = this.page <= 1;
    const noFim = this.page >= totalPages;
    this.botoes.first.disabled = noComeco;
    this.botoes.prev.disabled = noComeco;
    this.botoes.next.disabled = noFim;
    this.botoes.last.disabled = noFim;

    // Uma paginação de uma página só é ruído: some, em vez de mostrar quatro
    // botões cinzas que nunca vão fazer nada.
    this.container.hidden = totalPages <= 1 && this.total <= this.pageSize;

    // Se o botão que tinha o foco acabou de ser desabilitado (chegou na última
    // página), o foco escaparia para o body. Passa ele para o botão vizinho,
    // que ainda funciona -- assim dá para voltar sem pegar no mouse.
    const focado = document.activeElement;
    if (focado instanceof HTMLButtonElement && focado.disabled && this.container.contains(focado)) {
      const alternativa = focado === this.botoes.next || focado === this.botoes.last ? this.botoes.prev : this.botoes.next;
      if (!alternativa.disabled) alternativa.focus();
    }
  }

  _go(page) {
    const alvo = Math.min(this._totalPaginas(), Math.max(1, page));
    if (alvo === this.page) return;
    this.onChange(alvo);
  }
}
