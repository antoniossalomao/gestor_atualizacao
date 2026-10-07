# Plano de Refatoração e Melhorias Técnicas

Este documento apresenta um plano de refatoração para resolver gargalos de performance, reduzir duplicação de código e melhorar a manutenibilidade do código do Gestor de Atualizações. As sugestões estão ordenadas por prioridade técnica.

## Prioridade 1: Performance do Banco de Dados - Compilação de Statements SQLite
**Problema:** Atualmente, a biblioteca `better-sqlite3` é utilizada com `this.conn.prepare(...)` sendo invocado diretamente a cada execução em mais de 80 locais nos repositórios (ex: `ClienteRepository`, `VersaoRepository`, `AgendamentoRepository`, etc.). Embora o SQLite seja rápido, recompilar statements a cada consulta degrada o desempenho e bloqueia o event loop em situações de pico. O projeto já tem um mecanismo correto de cache em `BaseRepository.js` (`this._preparado(sql)`), mas ele só é usado em pouquíssimos locais (notavelmente na importação dentro de `AtualizacaoRepository`).
**Ação Proposta:**
- Substituir chamadas repetitivas de `this.conn.prepare(sql)` por `this._preparado(sql)` em todos os repositórios que herdam de `BaseRepository`.
- **Benefício:** Reduz alocação de memória e overhead de CPU no backend (expressão mensurada anteriormente: "era a maior parte dos 21s e do 1 GB de memória" na importação), garantindo maior concorrência e tempo de resposta estável em `GET /api/...`.

## Prioridade 2: Front-end - Divisão de Telas Monolíticas ("God Classes")
**Problema:** As telas (views) `client/js/views/AtualizacoesView.js` e `client/js/views/AgendamentosView.js` estão excessivamente grandes, ambas ultrapassando 1000 linhas. Essas classes misturam roteamento visual, listeners do DOM, formatação de saída e lógica de negócio específica da interface (como renderizar modais de exclusão e formulários grandes).
**Ação Proposta:**
- Refatorar os modais ou painéis laterais complexos de `AtualizacoesView` e `AgendamentosView` em componentes separados (ex: dentro de `client/js/components/` ou em uma nova pasta `client/js/views/atualizacoes/FormularioAtualizacao.js`).
- Isolar a lógica do "toolbar" ou "filter panels" das visualizações de lista em pequenos sub-módulos.
- **Benefício:** Manutenção isolada de pequenos escopos. Facilita muito a busca de bugs e evita que a edição do painel de filtros afete a renderização da grade e vice-versa.

## Prioridade 3: Front-end - Padronização de Componentes Complexos e Remoção de Lógica Repetitiva
**Problema:** O DOM manual (Vanilla JS sem framework) gera duplicação visual e estrutural. Muitas classes configuram o setup de formulários ou botões de actions. Além disso, existe duplicação de validações (ex: validação de e-mails/datas nos formulários via DOM manual ao invés de usar `domain/`).
**Ação Proposta:**
- Criar formulários componentizados reutilizáveis, centralizando o controle de submissão e desabilitação dos botões "Salvar" e os Toasts de sucesso, aproveitando o design do `TabelaOrdenavel.js`.
- Reforçar o ADR-0005 que diz "`domain/` não toca no DOM", trazendo qualquer tratativa complexa de visualização (ex: calculo exato de formatação de chips de filtros, lógica dos modais de importação e relatórios) para `components/` ou módulos base menores e reutilizáveis ao invés de codificados inline.

## Prioridade 4: Back-end - Otimização do N+1 em Iterações (`CampanhaService`, `AtualizacaoService`)
**Problema:** Há iterações (loops) percorrendo clientes e buscando dados que podem gerar gargalos se não utilizarem `JOINs` ou se chamarem funções baseadas em banco múltiplas vezes para colecionar estatísticas (exemplo: Resumo e consolidação de atualizações na memória nos `Services`).
**Ação Proposta:**
- Revisar `CampanhaService` e `AtualizacaoService` para que, ao cruzar métricas do Resumo, façam um uso mais robusto de SQL aggregators `COUNT()`, `GROUP BY` e `ROW_NUMBER() OVER()` — ferramentas nativas do SQLite que o projeto já usa em algumas consultas como na agregação da aba Sistemas (ADR-0008). Trazer o peso computacional de métricas de data para o SQLite em vez de carregar arrays grandes no Node.

## Conclusão
O estado da base de código é sólido, suportado por um robusto arquivo de ADRs (Documentation) e testes para cada funcionalidade principal, mas precisa ter sua infraestrutura local padronizada, especialmente expandindo as boas decisões (como o uso do `_preparado()`) para o restante do código onde essa lição ainda não havia sido aplicada uniformemente.