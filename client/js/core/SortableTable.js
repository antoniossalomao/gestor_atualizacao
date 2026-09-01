/**
 * Tabela genérica e ordenável, reaproveitada por todas as telas com lista
 * (Resumo, Atualizações, Agendamentos, Clientes). Equivalente combinado de
 * `ttk.Treeview` + `widgets.make_sortable` no app Tkinter original.
 *
 * Cada coluna é descrita como `{ key, label, type, largura }`, onde `type` é
 * "text" (padrão), "date" (dd/mm/aaaa) ou "numeric" -- controla como a coluna
 * é comparada ao clicar no cabeçalho.
 *
 * Três coisas foram reescritas em relação à primeira versão:
 *
 * **1. Render incremental.** Antes, clicar numa linha para selecioná-la
 * reconstruía o `<tbody>` inteiro -- 50 linhas × 9 colunas recriadas do zero
 * para trocar uma classe CSS. Isso custava um "pisca" visível e perdia a
 * posição de rolagem. Agora a seleção só liga/desliga a classe nas duas linhas
 * envolvidas, e `setRows` reaproveita as `<tr>` existentes quando a
 * quantidade bate, atualizando só o texto que mudou.
 *
 * **2. Teclado.** As linhas eram `<tr>` com `onclick` -- invisíveis para quem
 * navega por teclado. Agora a tabela tem um "cursor" (`↑`/`↓`) e `Enter`
 * seleciona, no padrão de grade que leitores de tela reconhecem.
 *
 * **3. `aria-sort` e cabeçalhos como botão**, para o estado de ordenação ser
 * anunciado em vez de existir só como uma setinha desenhada.
 */
export class SortableTable {
  /**
   * @param {HTMLElement} container onde a tabela é desenhada
   * @param {{
   *   columns: Array<{key: string, label: string, type?: "text"|"date"|"numeric", largura?: string}>,
   *   rowKey?: (row: any) => string|number,
   *   onSelect?: (row: any) => void,
   *   rowClass?: (row: any, i: number) => string,
   *   rowStyle?: (row: any, i: number) => Partial<CSSStyleDeclaration>,
   *   emptyMessage?: string,
   *   emptyNode?: () => HTMLElement,
   *   scroll?: boolean,
   *   selectable?: boolean,
   *   sortable?: boolean,
   *   serverSort?: boolean,
   *   onSortChange?: (key: string, dir: "asc"|"desc") => void,
   *   caption?: string,
   * }} options
   */
  constructor(container, options) {
    this.container = container;
    this.columns = options.columns;
    this.rowKey = options.rowKey || ((row) => row.id);
    this.onSelect = options.onSelect || (() => {});
    this.rowClass = options.rowClass || (() => "");
    this.rowStyle = options.rowStyle || (() => ({}));
    this.emptyMessage = options.emptyMessage || "Nenhum registro encontrado.";
    this.emptyNode = options.emptyNode || null;
    // Tabelas puramente informativas (ex.: os quadros da aba Resumo) não têm
    // nada a fazer com uma linha clicada -- sem isto, o cursor de "clicável" e
    // o destaque de seleção sugeririam uma interação que não existe.
    this.selectable = options.selectable !== false;
    this.sortable = options.sortable !== false;
    // "serverSort": quando os dados vêm paginados do servidor, ordenar só as
    // linhas da página atual daria um resultado errado -- nesse modo o clique
    // no cabeçalho não reordena nada aqui, só avisa `onSortChange`.
    this.serverSort = options.serverSort === true;
    this.onSortChange = options.onSortChange || (() => {});

    this.rows = [];
    this.sortState = { key: null, reverse: false };
    this.selectedKey = null;
    this.cursor = -1;
    this.loading = true;

    this.wrap = document.createElement("div");
    this.wrap.className = "table-wrap";
    this.table = document.createElement("table");
    this.table.className = "data-table";
    if (options.caption) {
      const caption = document.createElement("caption");
      caption.className = "sr-only";
      caption.textContent = options.caption;
      this.table.appendChild(caption);
    }
    this.thead = document.createElement("thead");
    this.tbody = document.createElement("tbody");
    this.table.append(this.thead, this.tbody);

    this.scrollBox = document.createElement("div");
    this.scrollBox.className = options.scroll === false ? "" : "table-scroll";
    this.scrollBox.appendChild(this.table);
    this.wrap.appendChild(this.scrollBox);
    container.replaceChildren(this.wrap);

    if (this.selectable) {
      this.tbody.addEventListener("keydown", (e) => this._teclado(e));
      // Um clique em qualquer lugar do corpo é resolvido aqui (delegação), em
      // vez de um listener por linha. Com 50 linhas isso é 1 listener em vez
      // de 50, e sobrevive à troca das linhas sem precisar reconectar nada.
      this.tbody.addEventListener("click", (e) => {
        const tr = e.target.closest("tr[data-key]");
        if (tr) this._selecionarPorElemento(tr);
      });
    }

    this._renderHead();
    this._renderBody();
  }

  /** Substitui os dados exibidos, mantendo ordenação/seleção quando possível. */
  setRows(rows) {
    this.loading = false;
    this.rows = rows;
    if (this.sortState.key && !this.serverSort) this._applySort();
    this._renderBody();
  }

  /** Marca a tabela como "atualizando" sem apagar o que já está na tela. */
  setRefreshing(ligado) {
    this.wrap.classList.toggle("is-refreshing", ligado);
  }

  selectByKey(key) {
    this._marcarSelecionada(key);
  }

  clearSelection() {
    this._marcarSelecionada(null);
  }

  _renderHead() {
    const tr = document.createElement("tr");
    for (const col of this.columns) {
      const th = document.createElement("th");
      th.scope = "col";
      if (col.largura) th.style.width = col.largura;

      const ordenadaPor = this.sortState.key === col.key;
      // `aria-sort` é o que faz um leitor de tela anunciar "ordenado de forma
      // crescente" ao entrar na coluna. A setinha sozinha não diz nada a quem
      // não enxerga a tela.
      th.setAttribute("aria-sort", ordenadaPor ? (this.sortState.reverse ? "descending" : "ascending") : "none");

      if (this.sortable) {
        // O cabeçalho vira um <button> de verdade: alcançável por Tab,
        // acionável por Enter/Espaço, anunciado como controle. Um <th> com
        // onclick não é nada disso.
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = "data-table__sort";
        botao.textContent = col.label;
        const seta = document.createElement("span");
        seta.className = "sort-arrow";
        seta.setAttribute("aria-hidden", "true");
        seta.textContent = ordenadaPor ? (this.sortState.reverse ? "▼" : "▲") : "";
        botao.appendChild(seta);
        botao.addEventListener("click", () => this._sortBy(col));
        th.appendChild(botao);
        if (ordenadaPor) th.classList.add("is-sorted");
      } else {
        th.textContent = col.label;
      }
      tr.appendChild(th);
    }
    this.thead.replaceChildren(tr);
  }

  _sortBy(col) {
    const reverse = this.sortState.key === col.key ? !this.sortState.reverse : false;
    this.sortState = { key: col.key, reverse };
    this._renderHead();
    if (this.serverSort) {
      this.onSortChange(col.key, reverse ? "desc" : "asc");
      return;
    }
    this._applySort();
    this._renderBody();
  }

  _applySort() {
    const col = this.columns.find((c) => c.key === this.sortState.key);
    if (!col) return;
    const factor = this.sortState.reverse ? -1 : 1;
    this.rows = [...this.rows].sort((a, b) => factor * compareValues(a[col.key], b[col.key], col.type));
  }

  _renderBody() {
    if (this.loading) {
      this.tbody.replaceChildren();
      this._renderSkeleton();
      return;
    }
    if (this.rows.length === 0) {
      this.tbody.replaceChildren();
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = this.columns.length;
      td.className = "table-empty";
      if (this.emptyNode) td.appendChild(this.emptyNode());
      else td.textContent = this.emptyMessage;
      tr.appendChild(td);
      this.tbody.appendChild(tr);
      return;
    }

    // As linhas de esqueleto e a linha de "nenhum resultado" não têm
    // `data-key`, então não entram no reaproveitamento abaixo -- e ficariam
    // penduradas acima dos dados reais na primeira renderização depois do
    // carregamento. Some com elas antes de qualquer outra coisa.
    for (const orfa of this.tbody.querySelectorAll("tr:not([data-key])")) orfa.remove();

    // Reaproveita as <tr> que já existem: trocar textContent de células é
    // muito mais barato (e não pisca) do que jogar fora e recriar o corpo.
    const existentes = [...this.tbody.querySelectorAll("tr[data-key]")];
    const sobrando = existentes.length - this.rows.length;
    for (let i = 0; i < sobrando; i++) existentes.pop().remove();

    this.rows.forEach((row, index) => {
      const key = this.rowKey(row);
      let tr = existentes[index];
      if (!tr) {
        tr = document.createElement("tr");
        for (let c = 0; c < this.columns.length; c++) tr.appendChild(document.createElement("td"));
        this.tbody.appendChild(tr);
      }

      tr.dataset.key = String(key);
      tr.className = this.rowClass(row, index) || "";
      if (!this.selectable) {
        tr.classList.add("is-readonly");
      } else {
        // `tabindex` só na linha "focada": um cursor por tabela, no padrão de
        // grade -- com 50 linhas focáveis, dar Tab viraria uma maratona.
        tr.tabIndex = index === Math.max(0, this.cursor) ? 0 : -1;
        if (key === this.selectedKey) tr.classList.add("is-selected");
        tr.setAttribute("aria-selected", String(key === this.selectedKey));
      }
      Object.assign(tr.style, this.rowStyle(row, index) || {});

      this.columns.forEach((col, c) => {
        const td = tr.children[c];
        const valor = row[col.key] ?? "";
        if (td.textContent !== String(valor)) td.textContent = valor;
        // O `title` só entra quando o texto de fato não coube -- antes ele era
        // posto em toda célula não-vazia, e o tooltip nativo do navegador
        // aparecia atrasado e fora do tema em cima de qualquer coisa.
        if (valor && String(valor).length > 28) td.title = valor;
        else td.removeAttribute("title");
      });
    });
  }

  _selecionarPorElemento(tr) {
    const index = [...this.tbody.querySelectorAll("tr[data-key]")].indexOf(tr);
    if (index < 0) return;
    this.cursor = index;
    const row = this.rows[index];
    this._marcarSelecionada(this.rowKey(row));
    this.onSelect(row);
  }

  /** Troca a classe só nas duas linhas envolvidas, sem redesenhar o corpo. */
  _marcarSelecionada(key) {
    this.selectedKey = key;
    for (const tr of this.tbody.querySelectorAll("tr[data-key]")) {
      const selecionada = key != null && tr.dataset.key === String(key);
      tr.classList.toggle("is-selected", selecionada);
      tr.setAttribute("aria-selected", String(selecionada));
    }
  }

  _teclado(e) {
    const linhas = [...this.tbody.querySelectorAll("tr[data-key]")];
    if (linhas.length === 0) return;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const passo = e.key === "ArrowDown" ? 1 : -1;
      this.cursor = Math.min(linhas.length - 1, Math.max(0, this.cursor + passo));
      this._moverCursor(linhas);
    } else if (e.key === "Home") {
      e.preventDefault();
      this.cursor = 0;
      this._moverCursor(linhas);
    } else if (e.key === "End") {
      e.preventDefault();
      this.cursor = linhas.length - 1;
      this._moverCursor(linhas);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const tr = linhas[this.cursor];
      if (tr) this._selecionarPorElemento(tr);
    }
  }

  _moverCursor(linhas) {
    linhas.forEach((tr, i) => {
      tr.tabIndex = i === this.cursor ? 0 : -1;
    });
    const alvo = linhas[this.cursor];
    alvo?.focus();
    alvo?.scrollIntoView({ block: "nearest" });
  }

  /** Linhas de "esqueleto" enquanto a primeira busca ainda não voltou. */
  _renderSkeleton() {
    const LINHAS = 5;
    for (let i = 0; i < LINHAS; i++) {
      const tr = document.createElement("tr");
      tr.className = "is-skeleton";
      this.columns.forEach((_col, c) => {
        const td = document.createElement("td");
        const bar = document.createElement("div");
        bar.className = "skeleton";
        bar.style.height = "12px";
        bar.style.width = `${55 + ((i * 17 + c * 23) % 35)}%`;
        td.appendChild(bar);
        tr.appendChild(td);
      });
      this.tbody.appendChild(tr);
    }
  }
}

function compareValues(a, b, type) {
  if (type === "date") return compareDates(a, b);
  if (type === "numeric") return compareNumeric(a, b);
  return String(a ?? "").trim().toLowerCase().localeCompare(String(b ?? "").trim().toLowerCase(), "pt-BR");
}

function compareDates(a, b) {
  const da = parseDataBR(a);
  const db = parseDataBR(b);
  if (!da && !db) return 0;
  if (!da) return -1; // datas ausentes/inválidas vão para o início
  if (!db) return 1;
  return da - db;
}

function parseDataBR(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto || ""));
  if (!m) return null;
  const [, dia, mes, ano] = m;
  return new Date(Number(ano), Number(mes) - 1, Number(dia)).getTime();
}

function compareNumeric(a, b) {
  return toNumeric(a) - toNumeric(b);
}

function toNumeric(value) {
  const texto = String(value ?? "").trim().toLowerCase();
  if (texto === "nunca") return Infinity;
  const n = parseFloat(texto);
  return Number.isNaN(n) ? -Infinity : n;
}
