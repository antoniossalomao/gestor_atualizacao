# Plano de Refatoração e Melhorias Técnicas

Revisão realizada em **07/10/2026**. O plano anterior continha hipóteses de desempenho e de consultas N+1 sem medição suficiente. Abaixo estão as correções verificadas e os trabalhos que ainda dependem de escopo e validação próprios.

## Revisão e limpeza concluídas

- [x] Verificar a sintaxe dos 221 arquivos JavaScript e a resolução dos 530 imports ESM locais.
- [x] Reaproveitar statements SQLite em 71 consultas de SQL fixo nos repositórios. SQL dinâmico continua sendo preparado conforme os filtros; não foi atribuída uma melhoria percentual sem benchmark.
- [x] Remover o método `BaseController.handle`, seu import sem uso e o lockfile vazio de dependências do cliente. Preservar documentos da raiz, configurações e dados.
- [x] Corrigir revisões de agendamentos ao concluir, arquivar e reabrir, incluindo arquivamento automático; preservar a data de conclusão existente e preencher a de tarefas criadas como concluídas.
- [x] Gerar downloads do banco por snapshot SQLite íntegro, incluindo alterações no WAL, com limpeza do arquivo temporário.
- [x] Proteger a restauração contra a poda da cópia escolhida, falha na cópia de segurança e banco incompatível; recuperar o banco anterior se a substituição falhar.
- [x] Recusar backup por cópia direta quando o checkpoint estiver bloqueado. No deploy, usar snapshot SQLite e nome único em vez de copiar o banco em uso.
- [x] Evitar que uma resposta atrasada recrie uma sessão já revogada e encerrar o armazenamento de sessões depois das requisições em andamento.
- [x] Tratar porta ocupada como falha de inicialização e liberar recursos.
- [x] Validar tipos de campos textuais antes de usar `.trim()`, limitar a paginação a inteiros seguros e impedir que propriedades herdadas sejam interpretadas como regras ou preferências.
- [x] Bloquear acesso a arquivos de desenvolvimento também com caminhos estáticos codificados ou diferenças de caixa.
- [x] Tratar hash de navegação malformado e armazenamento do navegador indisponível; limitar a espera das notificações HTTP.
- [x] Corrigir comentários sobre caminhos, regras, quantidade de públicos de campanhas, cache e comportamento de backup.

## Validação realizada

- `npm run check`: aprovado.
- `npm test`: **639 testes do servidor e 542 do cliente**, todos aprovados. Inclui regressões para os problemas acima e testes HTTP com SQLite temporário.
- `npm audit --prefix server --omit=dev`: nenhuma vulnerabilidade conhecida nas dependências de produção na consulta desta revisão.
- `git diff --check` e `docker compose config --quiet`: aprovados.
- Snapshot do deploy conferido em containers descartáveis, com banco em WAL e container ativo ou parado; integridade e conteúdo preservados.

Não houve implantação nem alteração dos dados de produção. A revisão combinou inventário estático de todo o JavaScript, inspeção dos fluxos críticos e testes; não incluiu uma conferência visual completa de todas as telas no navegador e não garante ausência de outros defeitos.

## Próximas refatorações

### 1. Extrair responsabilidades das telas maiores

`AtualizacoesView.js` tem 1.164 linhas e `AgendamentosView.js`, 1.004 nesta revisão. Extrair um formulário ou painel por vez, preservando estado, listeners e comportamento de navegação. Tamanho sozinho não justifica reescrever uma tela inteira.

**Aceite:** mesmos fluxos de criação, edição, filtros, exclusão e navegação; conferir no navegador em desktop e celular, além dos testes existentes.

### 2. Consolidar duplicações concretas de formulários

Identificar primeiro trechos realmente iguais de submissão, estado de botões e mensagens. Componentes podem manipular DOM; cálculos e validações puros devem continuar em `domain/` ou utilitários. Não mover funções puras apenas porque produzem texto usado na interface.

**Aceite:** a abstração deve reduzir duplicação entre consumidores reais, sem tornar regras específicas de uma tela genéricas à força.

### 3. Medir consultas antes de alterar agregações

Os cruzamentos principais de `CampanhaService` e `AtualizacaoService` já usam leituras em lote e mapas em memória. Não foi comprovada a hipótese geral de uma consulta por cliente do plano anterior. Medir quantidade de consultas, duração e memória com volume representativo antes de substituir agregações por SQL.

**Aceite:** comparar os mesmos resultados antes e depois, mantendo filtros, audiência das campanhas e versões históricas; registrar medição reproduzível e colocar SQL nos repositórios.
