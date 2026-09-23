# Como mexer neste projeto

Guia para quem vai alterar o painel web — inclusive você mesmo daqui a seis
meses, sem lembrar de nada. O [README](README.md) explica **o que** o sistema
faz; este arquivo explica **como trabalhar** nele.

## Preparar a máquina

Só o Node.js é necessário (versão 20 ou mais nova; testado em 22).

```bash
cd server
npm install
cp .env.example .env     # e edite o SESSION_SECRET: com o de exemplo o servidor não sobe
npm run dev              # sobe com reinício automático em http://localhost:3000
```

Na primeira vez, com o banco vazio, o próprio app pede para criar a conta de
administrador inicial. Não existe seed nem migration a rodar à mão: o schema é
criado e evoluído por `src/database/Database.js` na subida.

**Nunca aponte o `DB_PATH` do seu ambiente de desenvolvimento para o
`gestao.db` de produção.** Use uma cópia. Vários testes e telas gravam de
verdade.

## Rodar os testes

```bash
npm test                  # daqui, roda os dois lados (359 + 99 testes, ~8s)

npm run test:server       # só o servidor
npm run test:client       # só o front-end
node --test server/tests/clientes.test.js   # um arquivo só, ao investigar
```

Os testes do servidor sobem um `Database` -- e, em `routing.test.js`, um
`Server` completo numa porta efêmera -- com um banco SQLite descartável num
diretório temporário. **Não há mock de banco.** Não precisam de rede nem de
banco pré-existente: se um deles falhar, é o código que quebrou.

Dois detalhes das APIs internas que já custaram uma rodada vermelha ao escrever
testes novos:

- `repositorio.list()` devolve `{ rows, total, page, pageSize }` — **não**
  `items` — e **não ordena por id**. Para pegar "o que acabei de criar", use
  `find(id)` com o id vindo de `SELECT MAX(id)`, não a última linha da lista.
- `list()` não traz `criado_em`/`concluido_em`; só `find(id)` traz.

### Verificação de tipos

```bash
npm install          # uma vez, na raiz de web/ (traz só o verificador)
npm run check        # deve sair limpo, sempre
```

Não compila nada: lê o JavaScript que já existe e as anotações JSDoc que ele já
tem, e falha se houver inconsistência. Cobre o código **puro** dos dois lados:

- `client/js/domain/` e `client/js/utils/` — não tocam no DOM;
- `server/src/shared/` e `services/normalizacao.js` — não falam com o Node nem
  com o banco.

Ali o resultado é binário: **zero erros, ou achou algo real.** Já encontrou um
bug em produção: o painel de Saúde reportava "0 pacotes, 0 bytes" para sempre,
porque lia uma propriedade que a classe nunca teve.

Se um arquivo novo dessas pastas só passar quando você der um jeito de alcançar
o `document` ou o `fs`, ele está na pasta errada — a `lib` do TypeScript está
restrita de propósito para que isso apareça. Ver
[ADR-0006](docs/adr/0006-verificacao-de-tipos-sem-build.md).

Não há cobertura automática configurada, e isso é deliberado: um número de
cobertura convida a escrever teste para subir o número. O critério aqui é
outro — **toda regra que, se quebrar, causa prejuízo silencioso tem teste**
(permissões, validação de data, ordenação por coluna, paginação, roteamento,
cabeçalhos de segurança).

## Onde colocar cada coisa

### Servidor (`server/src/`)

O caminho de um pedido é sempre o mesmo, e cada camada só conhece a de baixo:

```
routes/  ->  controllers/  ->  services/  ->  database/
```

| Camada | Responsabilidade | O que NÃO pode ter |
|---|---|---|
| `routes/` | mapear URL → método de controller | qualquer lógica |
| `controllers/` | ler `req`, chamar um serviço, montar `res` | regra de negócio, SQL |
| `services/` | regra de negócio, validação, orquestração | `req`/`res`, SQL |
| `database/` | um repositório por tabela; o único lugar com SQL | regra de negócio |
| `middlewares/` | autenticação, papéis, limites, erros, 404 | regra de negócio |
| `shared/` | o que **mais de uma camada** usa | dependência de camada |
| `config/` | constantes do domínio | código executável |

Regra prática para `shared/`: um arquivo só entra ali quando já tem dois
consumidores em camadas diferentes. Enquanto tiver um só, ele mora junto de
quem usa. (`errors.js` está ali porque serviços, controllers e middlewares
todos lançam e capturam esses tipos.)

### Front-end (`client/js/`)

Sem framework e **sem etapa de build**: o que está em `client/` é exatamente o
que o navegador executa. Não introduza um bundler sem uma razão que justifique
perder isso.

A divisão das pastas segue uma regra só:

- **`utils/`** — não conhece o negócio. `formatarData`, `escapeHtml`, `debounce`.
- **`domain/`** — conhece o negócio, **não toca no DOM**. É o que dá para testar
  no Node sem navegador — e por isso é onde a lógica difícil deve morar.
- **`components/`** — peça de UI que não sabe em que tela está. Recebe dados,
  devolve elemento, emite evento.
- **`views/`** — uma tela. Conhece o domínio e o DOM, e junta os componentes.
- **`app/`** — o esqueleto: `App`, `View`, rota, tema, preferências, cache.

Na dúvida sobre onde colocar um arquivo novo, pergunte na ordem: *precisa do
DOM?* Se não, é `utils/` ou `domain/`. *Fala de cliente/atualização/agente?* Se
sim, `domain/`. *É reaproveitável entre telas?* Se sim, `components/`.

`js/api/ApiClient.js` é o **único** lugar que chama `fetch`. Uma tela nunca
fala HTTP direto — assim autenticação, cancelamento de requisição e tratamento
de erro têm um lugar só.

## Estilo de código

- **Português** em nomes de domínio, comentários e mensagens ao usuário; inglês
  só onde a linguagem/biblioteca impõe (`get`, `set`, `catch`).
- `.editorconfig` na raiz define indentação e fim de linha. Respeite-o.
- Classes em `PascalCase.js`, módulos de função solta em `camelCase.js` — a
  regra que já separa `SortableTable.js` de `date.js`.
- **Comentário explica *por quê*, não *o quê*.** O código já diz o que faz.
  Este projeto documenta decisão e armadilha: "isto parece redundante mas não
  é, porque X". Esse é o padrão estabelecido — e o mais valioso do repositório.
  Ao corrigir um bug não óbvio, deixe o porquê escrito ali.

## Segurança ao alterar

Três coisas quebram silenciosamente e caro:

1. **SQL montado com texto vindo do usuário.** Ordenação por coluna já tem uma
   porta de entrada segura (`shared/sortHelper.js`), que só aceita chaves de
   uma lista fixa. Use-a; não interpole `sortBy` no SQL.
2. **Uma rota nova sem `requireAuth`/`requireRole`.** O padrão é fechado: as
   proteções são montadas sobre a subárvore inteira em `routes/index.js`.
   Confira lá ao acrescentar rota.
3. **HTML montado com dado do usuário sem `escapeHtml`.** A CSP em `Server.js`
   já recusa script inline, mas isso é a segunda linha de defesa, não a
   primeira.

Ao mexer em qualquer um dos três, rode `server/tests/security.test.js`.

## Commits

Mensagem no imperativo, com o escopo entre parênteses quando ajudar:

```
fix(agendamentos): não arquivar tarefa reaberta no mesmo dia
feat(clientes): filtro por grupo/rede
docs: separar histórico de mudanças do README
```

O corpo, quando existir, responde **por que**, não o que — o diff já mostra o
que mudou.
