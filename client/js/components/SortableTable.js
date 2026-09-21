/** Espera antes de escurecer a tabela numa atualização (ver setRefreshing). */
const ATRASO_REFRESH_MS = 180;

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
   *   columns: Array<{key: string, label: string, type?: "text"|"date"|"numeric", largura?: string, title?: (row: any) => string, render?: (row: any) => Node}>,
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
   *   multiSelect?: boolean,
   *   onMultiSelect?: (chaves: string[]) => void,
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

    /*
     * Selecao multipla: SEM coluna de caixinhas -- Shift+clique (ou
     * Shift+seta, pelo teclado) marca o intervalo entre a ultima linha
     * clicada normalmente e a que recebeu o Shift, no mesmo gesto de
     * Explorer/Gmail/planilha. Fica DESLIGADA por padrao -- a maioria das
     * tabelas do app e' de leitura ou de "escolher um para editar", e nelas
     * um Shift+clique nao deveria fazer nada de especial.
     *
     * Convive com a selecao simples que ja havia: um clique NORMAL continua
     * carregando o registro no formulario (e encerra qualquer intervalo
     * marcado, como clicar fora de uma selecao no Explorer). So o Shift muda
     * de intencao: em vez de abrir a linha, ele a acrescenta a um lote.
     */
    this.multiSelect = options.multiSelect === true;
    this.onMultiSelect = options.onMultiSelect || (() => {});
    /** @type {Set<string>} chaves marcadas, como texto (igual ao dataset) */
    this.marcadas = new Set();
    /** Índice da linha onde o intervalo de Shift começa. -1 = nenhuma ainda. */
    this._ancoraIndex = -1;

    this.rows = [];
    this.sortState = { key: null, reverse: false };
    this.selectedKey = null;
    this.cursor = -1;
    this.loading = true;
    this._timerRefresh = null;

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
        // Botões dentro de uma célula têm ação própria. Selecionar a linha
        // junto faria um único clique executar duas intenções diferentes.
        if (e.target.closest("button, a, input, select")) return;
        const tr = e.target.closest("tr[data-key]");
        if (tr) this._selecionarPorElemento(tr, e.shiftKey);
      });
      if (this.multiSelect) {
        // Sem isto, segurar Shift e clicar duas vezes na tabela selecionaria o
        // TEXTO entre os dois cliques (o comportamento nativo do navegador
        // para Shift+clique) por cima de marcar as linhas -- os dois gestos
        // disputam a mesma tecla. `mousedown`, não `click`: é no mousedown que
        // o navegador decide começar essa seleção de texto.
        this.tbody.addEventListener("mousedown", (e) => {
          if (e.shiftKey) e.preventDefault();
        });
      }
    }

    this._renderHead();
    this._renderBody();
  }

  /** Substitui os dados exibidos, mantendo ordenação/seleção quando possível. */
  setRows(rows) {
    this.loading = false;
    this.rows = rows;
    if (this.sortState.key && !this.serverSort) this._applySort();
    // A âncora do Shift é um ÍNDICE de linha, não a chave de um registro --
    // depois de uma virada de página (ou de a lista mudar por qualquer outro
    // motivo), "linha 4" já não é o mesmo registro de antes. As MARCAS
    // continuam de propósito (é assim que dá para marcar linhas espalhadas em
    // páginas diferentes), só a âncora precisa esquecer o índice velho.
    this._ancoraIndex = -1;
    this._renderBody();
  }

  /**
   * Marca a tabela como "atualizando" sem apagar o que já está na tela.
   *
   * O escurecimento só entra depois de `ATRASO_REFRESH_MS`, pelo mesmo motivo
   * da barra de revalidação em View.js: a cada tecla digitada na busca (e a
   * cada troca de aba) a tabela apagava para 62% e voltava, quase sempre rápido
   * demais para ser lido como "carregando" -- só dava a impressão de que a
   * tabela pisca enquanto se digita. Quando a espera é real, o aviso aparece.
   */
  setRefreshing(ligado) {
    clearTimeout(this._timerRefresh);
    this._timerRefresh = null;
    if (!ligado) {
      this.wrap.classList.remove("is-refreshing");
      return;
    }
    this._timerRefresh = setTimeout(() => {
      this._timerRefresh = null;
      this.wrap.classList.add("is-refreshing");
    }, ATRASO_REFRESH_MS);
  }

  selectByKey(key) {
    this._marcarSelecionada(key);
  }

  clearSelection() {
    this._marcarSelecionada(null);
  }

  /** Move o cursor a partir de qualquer lugar da tela (atalhos j/k). */
  moverCursor(passo) {
    const linhas = [...this.tbody.querySelectorAll("tr[data-key]")];
    if (linhas.length === 0) return;
    this.cursor = Math.min(linhas.length - 1, Math.max(0, (this.cursor < 0 ? (passo > 0 ? -1 : linhas.length) : this.cursor) + passo));
    this._moverCursor(linhas);
  }

  ativarCursor() {
    const linhas = [...this.tbody.querySelectorAll("tr[data-key]")];
    if (linhas.length === 0) return;
    if (this.cursor < 0) this.cursor = 0;
    this._selecionarPorElemento(linhas[this.cursor], false);
  }

  alternarMarcacaoCursor() {
    if (!this.multiSelect) return;
    const linhas = [...this.tbody.querySelectorAll("tr[data-key]")];
    if (linhas.length === 0) return;
    if (this.cursor < 0) this.cursor = 0;
    const chave = linhas[this.cursor].dataset.key;
    if (this.marcadas.has(chave)) this.marcadas.delete(chave);
    else this.marcadas.add(chave);
    this._pintarMarcadas();
    this.onMultiSelect(this.selecionadas);
  }

  /** Chaves marcadas, como texto. */
  get selecionadas() {
    return [...this.marcadas];
  }

  /** Desmarca tudo (depois de excluir o lote, ou de o filtro mudar). */
  limparMarcadas() {
    this.marcadas.clear();
    // Também esquece a âncora: ela é um ÍNDICE de linha, não uma chave de
    // registro, e continuar apontando para "linha 4" depois de a lista ser
    // filtrada de novo marcaria um intervalo que não tem nada a ver com o que
    // a pessoa está vendo agora.
    this._ancoraIndex = -1;
    this._pintarMarcadas();
    this.onMultiSelect(this.selecionadas);
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
    // Mesmo motivo do reset em `setRows`: a ordem das linhas mudou, e a âncora
    // é um índice nessa ordem. Nenhuma tabela com `multiSelect` usa ordenação
    // no cliente hoje (todas são `serverSort: true`, que devolve por aqui bem
    // antes desta linha) -- isto é só para não deixar uma pegadinha pronta
    // caso uma futura passe a usar as duas coisas juntas.
    this._ancoraIndex = -1;
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
      // Zera antes de aplicar: esta <tr> pode estar sendo reaproveitada de
      // outro registro (ver o reuso acima), e `Object.assign` só ESCREVE as
      // propriedades que o rowStyle devolver -- as que ele deixar de devolver
      // ficariam com o valor da linha anterior grudado. Hoje o único rowStyle
      // do app (Sistemas) sempre devolve `background`, então o defeito está
      // latente; qualquer tabela futura com estilo condicional o acordaria.
      if (tr.style.cssText) tr.style.cssText = "";
      Object.assign(tr.style, this.rowStyle(row, index) || {});

      // A marca de "está no lote" vem do estado, e não do que a <tr>
      // reciclada tinha antes: sem isto, paginar deixaria a marca da linha
      // anterior colada num registro que nunca foi escolhido.
      if (this.multiSelect) tr.classList.toggle("is-marcada", this.marcadas.has(String(key)));

      this.columns.forEach((col, c) => {
        const td = tr.children[c];
        const valor = row[col.key] ?? "";
        if (col.render) {
          td.replaceChildren(col.render(row));
        } else if (td.textContent !== String(valor)) td.textContent = valor;
        // O `title` só entra quando o texto de fato não coube -- antes ele era
        // posto em toda célula não-vazia, e o tooltip nativo do navegador
        // aparecia atrasado e fora do tema em cima de qualquer coisa.
        //
        // `col.title`, quando a coluna declara um, é a exceção: existe
        // justamente para um dado que NÃO está truncado (ex.: "há 2 h" em vez
        // de "12/08/2026 03:14") mas ainda merece um tooltip com a versão
        // completa -- ver HistoricoView, que já pareava as duas no comentário
        // antes de esta coluna ter como cumprir a promessa.
        const dica = col.title ? col.title(row) : valor && String(valor).length > 28 ? valor : "";
        if (dica) td.title = dica;
        else td.removeAttribute("title");
      });
    });
  }

  /**
   * Um clique numa linha. Sem Shift, é a seleção simples de sempre (carrega
   * no formulário) e ela TAMBÉM encerra qualquer intervalo marcado -- é o
   * mesmo comportamento do Explorer: clicar um item sozinho larga a seleção
   * múltipla anterior. Com Shift, vira o oposto: marca o intervalo até a
   * âncora e não mexe no que está carregado no formulário, porque Shift é
   * "adicione ao lote", não "abra isto".
   *
   * @param {boolean} comShift veio de `e.shiftKey` (clique ou teclado)
   */
  _selecionarPorElemento(tr, comShift = false) {
    const linhas = [...this.tbody.querySelectorAll("tr[data-key]")];
    const index = linhas.indexOf(tr);
    if (index < 0) return;

    if (this.multiSelect && comShift) {
      this._selecionarIntervalo(index, linhas);
      return;
    }

    this.cursor = index;
    this._ancoraIndex = index;
    if (this.multiSelect && this.marcadas.size > 0) this._limparIntervalo();

    const row = this.rows[index];
    this._marcarSelecionada(this.rowKey(row));
    this.onSelect(row);
  }

  /**
   * Marca o intervalo entre a âncora (a última linha clicada sem Shift, ou a
   * primeira Shift+clique da sessão) e `indexAlvo`, substituindo o que já
   * estava marcado -- Shift+clique nunca ACRESCENTA a uma seleção antiga, ele
   * REDESENHA o intervalo inteiro a partir da âncora, que é o que Explorer,
   * Gmail e qualquer planilha fazem. Sem uma âncora ainda, o intervalo começa
   * e termina na própria linha clicada.
   */
  _selecionarIntervalo(indexAlvo, linhas = [...this.tbody.querySelectorAll("tr[data-key]")]) {
    if (linhas.length === 0) return;
    // Sem âncora ainda (primeiro Shift+clique da sessão, sem nenhum clique
    // normal antes): a própria linha clicada VIRA a âncora, e fica assim até
    // um clique normal a substituir. Precisa ser GRAVADO aqui, não só usado
    // localmente -- senão um segundo Shift+clique em seguida (sem um clique
    // normal entre os dois) recalcularia a âncora do zero a cada vez, e o
    // intervalo nunca cresceria além da última linha clicada.
    if (this._ancoraIndex < 0) this._ancoraIndex = indexAlvo;
    const ancora = this._ancoraIndex;
    const [inicio, fim] = ancora <= indexAlvo ? [ancora, indexAlvo] : [indexAlvo, ancora];

    this.marcadas.clear();
    for (let i = inicio; i <= fim; i++) {
      const key = this.rowKey(this.rows[i]);
      if (key != null) this.marcadas.add(String(key));
    }
    this.cursor = indexAlvo;
    this._pintarMarcadas();
    this._moverCursor(linhas);
    this.onMultiSelect(this.selecionadas);
  }

  _limparIntervalo() {
    this.marcadas.clear();
    this._pintarMarcadas();
    this.onMultiSelect(this.selecionadas);
  }

  /** Reflete o conjunto marcado nas linhas visíveis, sem redesenhar o corpo. */
  _pintarMarcadas() {
    for (const tr of this.tbody.querySelectorAll("tr[data-key]")) {
      tr.classList.toggle("is-marcada", this.marcadas.has(tr.dataset.key));
    }
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
      const novoCursor = Math.min(linhas.length - 1, Math.max(0, this.cursor + passo));
      // Shift+seta é o equivalente por teclado do Shift+clique. Sem isto, o
      // lote seria uma funcionalidade exclusiva de quem usa mouse -- e este
      // app cuida de teclado em toda outra tabela dele.
      if (this.multiSelect && e.shiftKey) {
        if (this._ancoraIndex < 0) this._ancoraIndex = this.cursor >= 0 ? this.cursor : novoCursor;
        this._selecionarIntervalo(novoCursor, linhas);
      } else {
        this.cursor = novoCursor;
        this._moverCursor(linhas);
      }
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
      if (tr) this._selecionarPorElemento(tr, e.shiftKey);
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
