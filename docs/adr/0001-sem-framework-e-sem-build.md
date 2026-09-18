# ADR-0001 — Front-end sem framework e sem etapa de build

**Situação:** Aceita

## Contexto

O painel tem ~15 telas com tabelas, formulários, modais e alguns gráficos. O
caminho padrão da indústria seria React (ou Vue/Svelte) com Vite, resultando em
`npm run build` gerando um bundle.

Duas restrições pesaram mais que o padrão:

1. **Quem mantém é uma equipe pequena, sem especialista em front-end.** O
   sistema precisa ser corrigível por quem abre o arquivo, vê o erro e
   conserta — eventualmente no servidor, às pressas, com o cliente esperando.
2. **O ciclo de vida esperado é longo e de manutenção baixa.** Um projeto com
   build parado por dois anos não compila mais: as versões das ferramentas
   saíram de baixo. HTML/CSS/JS servido direto continua rodando.

## Decisão

O front-end é HTML, CSS e JavaScript puro, com módulos ES nativos do navegador.
**O que está em `client/` é exatamente o que o navegador executa.** Sem
bundler, sem transpilação, sem `node_modules` no front-end.

Componentização é feita com classes de JavaScript manipulando o DOM
diretamente (`components/`, `views/`), e `ApiClient.js` é o único ponto que
fala HTTP.

## Consequências

**Ganhos**
- Depurar no navegador mostra o arquivo real, com os nomes reais, sem
  source map.
- Nenhuma dependência de front-end para auditar, atualizar ou quebrar.
- Alterar uma tela é editar um arquivo e recarregar a página.
- Não há classe inteira de problemas de configuração de build.

**Custos aceitos**
- Nada de JSX, reatividade automática ou gerenciamento de estado pronto. Cada
  tela atualiza o DOM explicitamente.
- Mais código repetido do que um framework exigiria.
- Sem checagem de tipos. Mitigado com JSDoc nas assinaturas públicas — e,
  desde o [ADR-0006](0006-verificacao-de-tipos-sem-build.md), com verificação
  estática desse JSDoc nas camadas sem DOM, ainda sem etapa de build.
- Sem *tree-shaking* nem minificação. Irrelevante em rede local.

**Obrigação que isso cria:** como não há compilador para pegar erro, o que dá
para testar sem navegador tem que ser testável — daí a regra de que `domain/`
não toca no DOM (ver [ADR-0005](0005-organizacao-do-client-por-responsabilidade.md)).

## Alternativas consideradas

- **React + Vite** — descartado: acrescenta uma cadeia de dependências e um
  passo de build que a equipe não tem como manter, para resolver um problema
  de complexidade de UI que este painel não tem.
- **Web Components nativos** — descartado por pouca margem. Dariam
  encapsulamento melhor, mas o Shadow DOM complicaria o tema global por
  variáveis CSS, que é o mecanismo central da aparência do app.
