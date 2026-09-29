# Runbook operacional

O que fazer quando alguma coisa dá errado, escrito para ser lido **durante** o
problema — não antes. Cada seção começa pelo sintoma como ele aparece para quem
reclama, não pelo nome técnico da causa.

Os comandos assumem que você está no servidor onde o painel roda, na pasta
`web/`, num PowerShell. Onde for preciso ser administrador, está dito.

> **Antes de qualquer intervenção que mexa em dados:** baixe o banco atual pelo
> painel (**Administração → Backups → Baixar o banco de agora**). Leva
> segundos e é a diferença entre um susto e um prejuízo.

---

## Índice de sintomas

| O que a pessoa diz | Vá para |
|---|---|
| "O painel não abre" / "deu erro de conexão" | [Servidor fora do ar](#servidor-fora-do-ar) |
| "Ninguém consegue entrar" | [Ninguém consegue entrar](#ninguém-consegue-entrar) |
| "Esqueci minha senha" | [Recuperar acesso](#recuperar-acesso-de-uma-conta) |
| "O cliente X não está atualizando" | [Agente parado](#um-agente-parou-de-atualizar) |
| "Sumiu/está errado um registro" | [Restaurar backup](#restaurar-um-backup) |
| "A página abre em branco" | [Página em branco](#página-em-branco-ou-sem-estilo) |
| "Está muito lento" | [Lentidão](#lentidão) |
| Disco enchendo no servidor | [Espaço em disco](#espaço-em-disco) |

---

## Servidor fora do ar

**Sintoma:** o navegador diz "não foi possível acessar esse site".

1. **Os containers estão de pé?** Na pasta `web/` do servidor:
   ```powershell
   docker compose ps
   ```
   `gestor` precisa estar `healthy` e `proxy` rodando. Parado →
   `docker compose up -d`.

2. **Subiu e caiu na hora?** O motivo fica no log do container:
   ```powershell
   docker compose logs --tail 40 gestor
   docker compose logs --tail 40 proxy
   ```

3. **Causas mais comuns**, em ordem de frequência:

   | No log aparece | Causa | O que fazer |
   |---|---|---|
   | `port is already allocated` (ao dar `up`) | outra coisa já usa a 443 (IIS, outro site) | `Get-NetTCPConnection -LocalPort 443` e decida quem fica, ou mude a porta do `proxy` no `docker-compose.yml` |
   | `defina GESTOR_ENDERECO` (ao dar `up`) | falta o `web/.env` | copiar `web/.env.example` para `web/.env` e ajustar |
   | `O servidor NÃO foi iniciado: SESSION_SECRET ...` | `server/.env` ausente ou com o segredo de exemplo | ver "Primeira vez" em "Rodar em Docker" no README |
   | `O servidor NÃO foi iniciado: SESSION_SECURE ...` / `TRUST_PROXY ...` | alguém mexeu nessas variáveis | no Docker elas vêm fixas do `docker-compose.yml`; desfaça a mudança |
   | `SQLITE_CANTOPEN` | caminho do `DB_PATH` errado | conferir `server/.env` (no Docker, deixe o padrão) |
   | `SQLITE_BUSY` / `database is locked` | duas instâncias abrindo o mesmo banco | garantir que ninguém está com `npm start` aberto no mesmo banco |

4. **Nome não encontrado** ("não foi possível encontrar o endereço IP do
   servidor"): o problema é o nome, não o painel. Confira o DNS da empresa ou
   o `hosts` daquele PC — ver "Nome em vez de IP" no README. Se funciona pelo
   IP e não pelo nome, é isto.

---

## Ninguém consegue entrar

**Sintoma:** a tela de login aceita a senha e volta para o login, ou diz
"não autenticado" sem explicação.

Quase sempre é **cookie de sessão que não chega**. Duas causas conhecidas:

1. **Acesso por `http://` ou pela porta 3000.** Na rede, o painel só atende
   `https://` + o endereço oficial (o `GESTOR_ENDERECO` do `web/.env`). Por
   `http://` ele nem responde; batendo direto no Node, recusa com "só aceita
   conexões HTTPS".

2. **`SESSION_SECRET` mudou.** Trocar esse valor invalida todas as sessões —
   é o comportamento correto, e todo mundo só precisa entrar de novo. Se isso
   aconteceu sem ninguém ter mexido, alguém recriou o `.env` a partir do
   `.env.example`, e aí o segredo voltou a ser o valor público de exemplo.
   **Isso é um incidente de segurança**: gere um novo e reinicie.
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

---

## Recuperar acesso de uma conta

Não há envio de e-mail neste sistema — de propósito. O fator de recuperação é
**ter acesso ao arquivo do banco**, o que só quem chega no servidor tem.

```powershell
docker compose exec gestor node resetar-senha.js <usuario> "<nova senha>"
```

Funciona mesmo para o único administrador, e não exige saber a senha antiga.

Se **nenhuma conta de administrador existir mais** (situação que o app tenta
impedir: não deixa rebaixar nem excluir o último admin), a saída é restaurar um
backup anterior — ver abaixo.

---

## Um agente parou de atualizar

**Sintoma:** um cliente ficou para trás, ou a aba **Distribuição** mostra o
agente como *offline* (sem contato há 24h+) ou com *erro*.

Com `DISCORD_WEBHOOK_URL` configurada, o próprio app avisa no canal quando um
agente entra nesse estado — e avisa de novo quando volta. O aviso sai **na
transição**, não a cada ciclo, para não virar ruído.

Investigue nesta ordem — do mais provável para o menos:

0. **O Atualizador está ligado?** Desde 22/09/2026 ele está **desativado de
   propósito** em Administração → Atualizador (ver a seção 3.4 de
   [DOCUMENTACAO_CONSOLIDADA.md](DOCUMENTACAO_CONSOLIDADA.md#34-estado-atual-pré-piloto)).
   Desativado, a API dos agentes responde 403 a tudo, e a aba Distribuição
   nem aparece. Nenhum cliente atualiza e nenhum alerta sai. Se for esse
   o caso, não há nada quebrado para investigar.

1. **Abra o detalhe do agente** (aba Distribuição → clique na linha). O último
   retorno diz em que fase ele parou e com qual mensagem. Metade dos casos
   termina aqui.

2. **O serviço está rodando na máquina do cliente?** No servidor dele:
   ```powershell
   Get-Service -Name "Agente Atualizador ERP"
   ```

3. **O agente consegue alcançar o painel?** Da máquina do cliente:
   ```powershell
   Invoke-WebRequest "$($env:API_URL)/agente/status/<CODIGO_CLIENTE>" -Headers @{ "x-agent-token" = "<token>" }
   ```
   - **401** → o `API_TOKEN` do `atualizador.ini` não bate com o
     `AGENT_API_TOKEN` do servidor. Ver [rotação de token](#rotacionar-o-token-dos-agentes).
   - **sem resposta** → rede/firewall, ou `API_URL` apontando para um endereço
     que o cliente não enxerga.

4. **O endereço para os agentes está certo?** (Administração → Atualizador →
   "Endereço deste servidor para os agentes".) Esta é a armadilha clássica: se
   estiver `https://localhost`, o link de download que o agente recebe
   aponta para **ele mesmo**, e o download falha sempre. Tem que ser o endereço
   pelo qual *os outros* enxergam o servidor. Se o IP veio de DHCP e mudou, é
   isto. Atenção: o link vai gravado no pacote no momento do upload -- pacote
   enviado com o endereço errado precisa ser enviado de novo.

5. **O agente está pausado?** Existe uma chave geral por cliente no painel. Um
   agente pausado fica vivo e respondendo, mas não inicia ciclo nenhum — e é
   fácil esquecer que alguém pausou.

6. **Nada disso?** Os logs do agente estão no Visualizador de Eventos do Windows
   da máquina do cliente, em *Logs do Windows → Aplicativo*, origem
   `Agente Atualizador ERP`.

> Se o cliente tem sistemas **com script**, leia
> [`RISCOS-CONHECIDOS.md`](../../atualizador/RISCOS-CONHECIDOS.md) antes de
> mexer. Uma intervenção no meio da Fase 3 pode deixar o banco dele em
> shutdown.

---

## Restaurar um backup

Um `gestao.db` é copiado para `server/data/backups/` **toda vez que o servidor
sobe**, e as 10 cópias mais recentes ficam guardadas.

Pelo painel (**Administração → Backups**), como administrador:

1. **Baixe o banco atual primeiro.** Restaurar substitui o que existe hoje; se
   o problema for outro, você vai querer o estado anterior de volta.
2. Escolha o backup pela data e clique em restaurar.
3. Digite `RESTAURAR` em caixa alta e a senha da sua conta de administrador.
4. **Todas as sessões são invalidadas** — todo mundo volta para a tela de login.
   Isso é intencional: sessões criadas depois do backup apontariam para dados
   que não existem mais.

Avise a equipe antes. Tudo que foi registrado entre o backup e agora **se
perde**.

---

## Rotacionar o token dos agentes

O `AGENT_API_TOKEN` é **um só, compartilhado por todos os agentes**. Rotacionar
não é uma operação isolada no servidor:

1. Gere o novo valor:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Atualize o `API_TOKEN` no `atualizador.ini` de **todos** os agentes
   instalados e reinicie cada serviço.
3. **Só então** troque o `AGENT_API_TOKEN` no `.env` do servidor e reinicie.
   (A chave não é editável pelo navegador: a tela Administração → Atualizador
   só mostra se ela está configurada e como termina, para conferir que a
   troca pegou.)

Fazendo na ordem inversa, todos os agentes passam a receber 401 até você
terminar — e do ponto de vista do painel isso é **silencioso**: os agentes
simplesmente param de se comunicar, como se estivessem offline.

---

## Página em branco ou sem estilo

**Sintoma:** o painel carrega branco, ou aparece sem formatação.

1. **Abra o console do navegador** (F12 → Console). A mensagem quase sempre
   nomeia o arquivo que não carregou.

2. **`Failed to load module script: expected a JavaScript module script but the
   server responded with a MIME type of text/html`** — um arquivo `.js`
   referenciado não existe no caminho pedido. Desde a correção de set/2026 o
   servidor responde **404 de verdade** nesse caso, em vez de devolver o
   `index.html`, então o console aponta o caminho certo. Confira se o arquivo
   está onde o import diz.

3. **Só o estilo sumiu:** `/css/theme.css` ou `/css/components.css` deu 404.

---

## Lentidão

O banco é SQLite com driver **síncrono**, então uma consulta lenta trava o
processo inteiro ([ADR-0002](DOCUMENTACAO_CONSOLIDADA.md#adr-0002)). Com o
volume atual isso é teórico, mas se acontecer:

1. **Confira o tamanho do banco** em **Administração → Saúde do servidor**.
2. **Alguém pediu uma página gigante?** O `pageSize` tem teto de 200 no
   servidor, então não é isso — mas exportação de `.xlsx` de milhares de linhas
   é legitimamente pesada e bloqueia enquanto roda.
3. **O arquivo `-wal` cresceu muito?** Acontece quando o banco fica muito tempo
   sem fechar direito. `docker compose restart gestor` faz o *checkpoint*.

---

## Espaço em disco

Duas coisas crescem sozinhas (o log sai em `docker compose logs`, que o
Docker guarda com o container):

| Pasta | O que é | Pode apagar? |
|---|---|---|
| `server/data/backups/` | cópias do banco na subida | as 10 mais recentes são mantidas automaticamente; as antigas já saem sozinhas |
| `server/data/packages/` | pacotes de versão servidos aos agentes | **cuidado**: um pacote apagado quebra o download de quem ainda não atualizou |

O painel de **Saúde** mostra o total e o tamanho dos pacotes. (Esse número ficou
zerado por um bug até set/2026 — se você lembra dele sempre mostrando zero, era
isso, e está corrigido.)

---

## Verificar se está tudo são

```powershell
cd web
npm run check     # verificação estática de tipos
npm test          # 458 testes
```

E, pelo navegador, **Administração → Saúde do servidor**: integridade do banco,
último backup, situação de cada agente, uso de memória e tempo no ar.

`statusGeral` só fica `saudavel` quando a integridade do banco está `ok` **e**
nenhum agente está em erro. Qualquer outra coisa vira `atencao` — que é um
convite a olhar, não necessariamente um incidente.
