# Planejamento de Melhorias de Interface (UI), Experiência (UX) e Funcionalidades

**Projeto:** Gestor de Atualizações — Painel Web  
**Data:** Setembro de 2026  
**Documento:** Planejamento Estratégico de Evolução Visual e Funcional  
**Diretriz Central:** Tornar o sistema mais intuitivo, elegante e produtivo sem abrir mão da filosofia arquitetural: *zero-build, JavaScript puro (ES Modules), CSS semântico com tokens e máxima velocidade de resposta no SQLite.*

---

## 1. Diagnóstico do Estado Atual

O Gestor de Atualizações possui uma base técnica excepcional: arquitetura em camadas bem definida, semântica ARIA de acessibilidade, sistema de design centralizado por variáveis CSS (`theme.css`), modo claro/escuro nativo, controle de permissões por papéis (RBAC), histórico de auditoria e alta densidade de informação.

Contudo, na rotina operacional de uma equipe que atende centenas de clientes e sistemas, existem pontos de atrito cognitivo e visual que podem ser elevados para o padrão dos softwares SaaS mais refinados do mercado (como Linear, Vercel, Stripe e Raycast):

### Principais Fricções Identificadas

1. **Formulários Fixos Ocupando Espaço Precioso das Tabelas:**
   - Nas telas de *Atualizações* e *Agendamentos*, os formulários de cadastro/edição ficam afixados acima da tabela, ocupando cerca de 35% a 40% da altura visível da tela. Isso empurra os dados para baixo e exige rolagem vertical constante.
2. **Separação Artificial entre Cadastro de Clientes e Consulta:**
   - A aba *Clientes* foca em listagem e dados cadastrais, enquanto a aba *Consultar Cliente* foca na matriz de versões e histórico. O operador frequentemente precisa alternar entre as duas telas para entender a situação completa de um cliente.
3. **Filtros com Digitação Manual de Datas:**
   - O filtro de período exige digitação de strings (`dd/mm/aaaa`), quando no dia a dia 90% das consultas são relativas ("Hoje", "Ontem", "Esta Semana", "Este Mês").
4. **Agendamentos Limitados à Tabela Linear:**
   - Tarefas operacionais com prazos funcionam muito melhor com visualização em pipeline ou quadro (Kanban por status), permitindo arrastar ou avançar status com 1 clique.
5. **Transições Bruscas e Falta de Estados de Carregamento Esqueleto (Skeletons):**
   - Ao trocar de aba ou carregar listagens grandes, o conteúdo pisca ou salta de uma vez. A adição de *skeletons* sutis confere uma sensação de produto polido e de carregamento instantâneo.
6. **Gráficos SVG com Visual Estático:**
   - Os gráficos em SVG (pizza, linhas, barras) são funcionais, mas faltam gradientes modernos, curvas suaves (*splines*), cantos arredondados e *tooltips* flutuantes interativos ao passar o mouse.

---

## 2. Pilar 1: Elegância Visual & Design System Refinado

O objetivo é transformar a interface em uma experiência visualmente premium, com foco em clareza tipográfica, profundidade suave e micro-interações que encantam o usuário.

### 2.1 Atmosfera Visual, Profundidade e "Glassmorphism" Sutil
- **Bordas com Micro-brilho:** Em temas escuros, adicionar uma borda sutil translúcida nos cards (`border: 1px solid rgba(255, 255, 255, 0.07)` e gradiente de fundo suave de 135deg).
- **Elevação e Superfícies Flutuantes:** O cabeçalho fixo, a barra de ações em lote e os menus devem usar `backdrop-filter: blur(12px) saturate(160%)` com borda inferior sutil, criando a sensação de sobreposição natural sem peso visual.
- **Tipografia com Alinhamento Numérico Tabular:**
  - Aplicar `font-variant-numeric: tabular-nums` em todas as colunas de IDs, versões, datas, horas, portas e contadores. Isso evita que números com larguras diferentes façam tabelas e cartões "vibrarem" ao mudar de valor.

### 2.2 Modernização dos Gráficos SVG Manuais
Sem instalar nenhuma dependência pesada (preservando o código puro):
- **Gráfico de Linha (Tendência):**
  - Adicionar área sombreada com gradiente translúcido abaixo da curva (`fill: url(#gradiente-tendencia)`).
  - Usar curvas de Bézier cúbicas suaves no lugar de segmentos retos rígidos.
  - Indicador de ponto com anel pulsante no valor do mês mais recente.
- **Gráficos de Barra:**
  - Adicionar cantos arredondados no topo das barras (`rx="4"` ou `rx="6"`).
  - Animação CSS suave de crescimento na primeira montagem (`transition: height 300ms cubic-bezier(0.16, 1, 0.3, 1)`).
- **Tooltips Flutuantes Ricos:**
  - Ao passar o mouse sobre qualquer fatia, ponto de linha ou barra, exibir um balão estilizado com data exata, valor e percentual relativo.

### 2.3 Skeletons & Micro-animações de Transição
- Substituir telas em branco momentâneas por cartões "esqueleto" animados com efeito shimmer (*onda de luz translúcida*):
  - Linhas de tabela cinzas pulsantes na altura correta antes dos dados renderizarem.
  - Cartões de indicadores com contornos pré-desenhados.
- **Micro-interações:**
  - Efeito tátil suave ao clicar em botões (`transform: scale(0.98)`).
  - Checkboxes e radio buttons com transição suave de escala e preenchimento.

---

## 3. Pilar 2: Intuitividade & Fluxo de Trabalho (UX)

### 3.1 Formulários em Gaveta Lateral (Slide-Over Drawers)
Em vez de formulários estáticos empurrando as tabelas para baixo:
- **Gaveta Lateral Deslizante:** Ao clicar em `+ Nova Atualização` (ou pressionar a tecla `N`), uma gaveta elegante desliza da direita para a esquerda sobre a tela.
- **Vantagens Imediatas:**
  - A tabela de dados ganha 100% da altura da tela, exibindo 2 a 3 vezes mais registros sem rolagem.
  - O operador pode consultar a tabela de fundo enquanto preenche o formulário.
  - Atalho `Esc` fecha a gaveta com confirmação caso haja dados digitados.
  - Foco automático no primeiro campo assim que a animação conclui.

### 3.2 Ações Rápidas nas Linhas da Tabela (Hover Quick-Actions)
Em vez de exigir selecionar a linha, rolar até o rodapé e clicar em um botão:
- Ao passar o cursor sobre uma linha da tabela, revelam-se ícones rápidos na última coluna:
  - **Em Atualizações:** 📋 *Copiar Relatório Formatado*, ✏️ *Editar*, 👤 *Ver Ficha do Cliente*.
  - **Em Agendamentos:** ✅ *Marcar Concluído*, 🔄 *Converter em Atualização*, ✏️ *Editar*.
  - **Em Clientes:** 🔑 *Copiar AnyDesk/Acesso*, 🔍 *Abrir Ficha 360°*, ✏️ *Editar*.

### 3.3 Presets de Período e Filtros com 1 Clique
Substituir o campo de digitação de texto puro por botões de atalho rápido (*Pills/Chips*):
- `Hoje` | `Ontem` | `Esta Semana` | `Este Mês` | `Últimos 30 dias` | `Personalizado`
- O filtro personalizado continua disponível, mas com máscara de formatação automática para datas.
- Chips de filtros ativos exibem contadores claros (ex.: `Responsável: Camila ✕`, `Período: Este mês ✕`) com botão `Limpar todos`.

### 3.4 Quadro Kanban / Alternância de Visão em Agendamentos
Adicionar seletor no topo da tela de Agendamentos:
```
[ 📋 Lista Tabular ]   [ 📊 Quadro Kanban ]
```
- **Quadro Kanban com 4 Colunas:**
  1. `Pendentes`
  2. `Em Andamento`
  3. `Aguardando Cliente / Bloqueado`
  4. `Concluídos Recentemente`
- Cada cartão exibe: Nome do Cliente, Sistema, Responsável, Horário agendado e um badge de alerta caso a data esteja vencida.
- Botão rápido de avanço de coluna diretamente no cartão.

### 3.5 Ficha Unificada do Cliente (Hub 360°)
Integrar a experiência de consulta e cadastro de clientes em um painel único e coeso:
- Ao clicar em um cliente em qualquer lugar do sistema (Clientes, Atualizações, Agendamentos ou busca global), abre-se a **Ficha 360° do Cliente** organizada em abas internas:
  1. **Resumo & Cadastro:** Código, Grupo/Rede, Cidade, CNPJ e Sistemas contratados.
  2. **Acessos Remotos:** Lista das máquinas (Servidor, Caixa 1, Retaguarda) com identificador AnyDesk / Suporte Bredas, senha e botão de 1 clique para copiar.
  3. **Matriz de Versões:** Versão instalada em cada sistema × Versão mais recente publicada, com indicador semântico (`Em dia`, `Desatualizado há X dias`).
  4. **Linha do Tempo de Atendimentos:** Histórico cronológico das últimas atualizações e chamados realizados.

### 3.6 Botão Global de Ação Rápida no Cabeçalho (+ Ação Rápida)
No topo do cabeçalho (ao lado da busca Ctrl+K), um botão destacado com menu suspenso ou atalho `Alt+N`:
- `Nova Atualização`
- `Novo Agendamento`
- `Novo Cliente`
- `Publicar Nova Versão`
Isso permite registrar um atendimento ou criar uma tarefa imediatamente, mesmo estando no meio da visualização de um gráfico ou relatório.

### 3.7 Teclado First: Navegação Avançada sem Mouse
- `j` e `k` (ou setas): navega linha por linha nas tabelas.
- `Enter` ou `e`: abre edição ou gaveta do registro selecionado.
- `Espaço` ou `x`: marca/desmarca registro na seleção múltipla em lote.
- `c`: copia o relatório de atendimento da linha em foco.
- `/`: foca instantaneamente na barra de pesquisa da aba atual.
- `?`: abre a colinha de atalhos em modal moderno.

---

## 4. Pilar 3: Inovações Funcionais de Alto Valor

### 4.1 Grupos Piloto e Lançamento Gradual de Versões (Canary Releases)
- **Cenário Atual:** Uma versão publicada é distribuída imediatamente para todos os clientes daquele sistema que possuem agente automático ativo.
- **Proposta:**
  - Ao preparar uma versão, permitir marcar como:
    - `Geral` (todos os clientes) ou
    - `Piloto / Restrita` (apenas para códigos de clientes selecionados para homologação).
  - O painel exibe métricas de adoção do grupo piloto (ex.: 5 clientes rodando há 48 horas sem erros).
  - Um botão com um clique promove a versão de `Piloto` para `Produção Geral`.
  - **Botão de Rollback de Emergência:** Se uma versão apresentar problemas críticos em campo, um botão de rollback reverte imediatamente a versão ativa para a anterior, notificando os agentes.

### 4.2 Geração Automática de Tarefas a partir da Análise de Sistemas
- Na tela **Sistemas**, onde o gestor visualiza quais clientes estão defasados antes de determinada data de corte:
  - Adicionar o botão: **"Gerar Agendamentos em Lote"**.
  - O sistema cria automaticamente tarefas em `Agendamentos` atribuídas aos operadores para contatarem os clientes que ficaram para trás, com status `Pendente` e motivo preenchido.

### 4.3 Histórico de Auditoria com Visualização "Antes × Depois" (Diffs)
- Na tela de **Histórico**, ao clicar em uma linha de alteração:
  - Abrir um balão ou gaveta com o comparativo de alterações:
    - *Versão:* ~~`8.4.0`~~ ➔ `8.5.1`
    - *Máquinas:* ~~`1`~~ ➔ `3`
    - *Responsável:* ~~`Lucas`~~ ➔ `Camila`
  - Para exclusões, permitir visualizar o espelho completo do registro que foi removido.

### 4.4 Atualização em Tempo Real (Live Pulse) na Distribuição
- No dia do lançamento de uma atualização crítica:
  - Modo opcional de **Auto-refresh suave** a cada 30 segundos com barra de progresso visual no topo ("Atualizando em 15s...").
  - Som ou toast discreto quando um agente com erro conseguir concluir a atualização com sucesso.

### 4.5 Prevenção Amigável de Edição Simultânea (Concorrência Otimista)
- Adicionar coluna `revisao` ou `atualizado_em` nos registros.
- Caso o Operador A salve um registro que o Operador B acabou de modificar há segundos, exibir aviso amigável:
  *"Este agendamento foi atualizado por Camila há 1 minuto. Veja as diferenças antes de sobrescrever."*

---

## 5. Matriz de Priorização (Esforço × Impacto)

| Iniciativa | Tipo | Impacto | Esforço | Prioridade |
|---|---|:---:|:---:|:---:|
| **Gavetas Laterais (Drawers) para Formulários** | UX / Espaço | Alto | Médio | **P1 (Imediata)** |
| **Presets Rápidos de Filtros de Período** | UX / Agilidade | Alto | Baixo | **P1 (Imediata)** |
| **Ações Rápidas nas Linhas (Hover Quick-Actions)** | UX / Eficiência | Alto | Baixo | **P1 (Imediata)** |
| **Polimento dos Gráficos SVG (Gradients & Tooltips)** | UI / Elegância | Alto | Médio | **P2 (Curto Prazo)** |
| **Ficha 360° Unificada do Cliente** | UX / Visão Geral | Alto | Médio | **P2 (Curto Prazo)** |
| **Quadro Kanban em Agendamentos** | UX / Produtividade | Alto | Médio | **P2 (Curto Prazo)** |
| **Skeletons de Carregamento & Micro-animações** | UI / Elegância | Médio | Baixo | **P2 (Curto Prazo)** |
| **Botão Global de Ação Rápida no Cabeçalho** | UX / Agilidade | Médio | Baixo | **P2 (Curto Prazo)** |
| **Atalhos de Teclado Avançados (`j`/`k`, `n`, `/`)** | UX / Power User | Médio | Baixo | **P3 (Médio Prazo)** |
| **Gerar Agendamentos em Lote na tela de Sistemas** | Funcional | Alto | Médio | **P3 (Médio Prazo)** |
| **Grupo Piloto e Rollback em Versões** | Funcional / Segurança | Alto | Médio | **P3 (Médio Prazo)** |
| **Histórico com Diffs Visuais (Antes × Depois)** | Funcional / Auditoria | Médio | Médio | **P3 (Médio Prazo)** |

---

## 6. Roteiro de Implementação Sugerido (Roadmap em Fases)

### Fase 1: Descongestionamento Visual e Aceleração de Rotina (1 a 2 semanas)
- **Foco:** Eliminar atritos imediatos de espaço e cliques.
1. Implementar o componente `Drawer.js` (Gaveta Lateral Direita) e migrar os formulários de *Atualizações* e *Agendamentos*.
2. Adicionar presets de período nos filtros (`Hoje`, `Esta Semana`, `Este Mês`).
3. Adicionar ações rápidas nas linhas das tabelas ao passar o mouse.
4. Adicionar botão global `+ Ação Rápida` no cabeçalho.

### Fase 2: Redesenho do Fluxo do Cliente e Modo Kanban (2 semanas)
- **Foco:** Produtividade operacional no dia a dia.
1. Criar o modal/drawer da **Ficha 360° do Cliente** com abas de Dados, Acessos AnyDesk com cópia rápida, Matriz de Versões e Linha do Tempo.
2. Criar a visualização em **Quadro Kanban para Agendamentos**, com alternância fluida entre Tabela e Cards.
3. Integrar atalho de geração de agendamento diretamente na lista de clientes desatualizados da tela de *Sistemas*.

### Fase 3: Elevação Visual Premium e Gráficos Interativos (1 a 2 semanas)
- **Foco:** Elegância, transições e acabamento estético.
1. Atualizar os componentes de gráficos SVG (`LineChart.js`, `BarChart.js`, `PieChart.js`) com curvas suaves, gradientes, cantos arredondados e tooltips interativos ao passar o mouse.
2. Adicionar componentes de *Skeleton Shimmer* para carregamento de tabelas e cartões.
3. Adicionar navegação por teclado estilo *Linear* (`j`/`k` para linhas, `e` para editar, `/` para focar busca).

### Fase 4: Automações e Distribuição Segura (2 semanas)
- **Foco:** Segurança de implantação em campo e auditoria rica.
1. Implementar suporte a grupo piloto (homologação prévia de novas versões).
2. Botão de rollback rápido em caso de anomalias reportadas pelos agentes.
3. Diffs visuais (antes e depois) na trilha de auditoria do *Histórico*.

---

## 7. Exemplos de Conceito Visual (Mockups de Código CSS / HTML)

### Exemplo 1: Componente Gaveta Lateral (Slide-Over Drawer)
```css
/* client/css/components.css */
.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: var(--veu-overlay);
  backdrop-filter: blur(4px);
  z-index: 100;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--dur-media) var(--curva-padrao);
}

.drawer-backdrop.is-open {
  opacity: 1;
  pointer-events: auto;
}

.drawer-panel {
  position: fixed;
  inset: 0 0 0 auto;
  width: min(560px, 92vw);
  background: var(--cor-superficie);
  border-left: 1px solid var(--cor-borda);
  box-shadow: var(--sombra-flutuante);
  z-index: 101;
  transform: translateX(100%);
  transition: transform var(--dur-lenta) cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
}

.drawer-backdrop.is-open .drawer-panel {
  transform: translateX(0);
}
```

### Exemplo 2: Presets Rápidos de Filtro de Data
```html
<div class="date-presets" role="group" aria-label="Filtro rápido de período">
  <button type="button" class="btn btn--preset is-active" data-range="mes">Este mês</button>
  <button type="button" class="btn btn--preset" data-range="semana">Esta semana</button>
  <button type="button" class="btn btn--preset" data-range="hoje">Hoje</button>
  <button type="button" class="btn btn--preset" data-range="custom">Personalizado…</button>
</div>
```

### Exemplo 3: Ações Rápidas na Linha da Tabela
```css
.data-table tbody tr .row-actions {
  opacity: 0;
  transform: translateX(4px);
  transition: opacity var(--dur-rapida) var(--curva-padrao),
              transform var(--dur-rapida) var(--curva-padrao);
}

.data-table tbody tr:hover .row-actions,
.data-table tbody tr:focus-within .row-actions {
  opacity: 1;
  transform: translateX(0);
}
```

---

## 8. Conclusão

Com este planejamento, o **Gestor de Atualizações** evolui de um painel operacional tradicional para uma ferramenta de padrão internacional — fluida, altamente intuitiva, esteticamente sofisticada e focada na produtividade da equipe, mantendo a leveza extrema que torna o projeto especial.
