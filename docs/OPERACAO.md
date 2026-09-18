# Runbook operacional

O que fazer quando alguma coisa dá errado, escrito para ser lido **durante** o
problema — não antes. Cada seção começa pelo sintoma como ele aparece para quem
reclama, não pelo nome técnico da causa.

Os comandos assumem que você está no servidor onde o painel roda, na pasta
`web/`, num PowerShell. Onde for preciso ser administrador, está dito.

> **Antes de qualquer intervenção que mexa em dados:** baixe o banco atual pelo
> painel (**Configurações → Sistema → Backups → Baixar banco atual**). Leva
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

1. **O serviço está rodando?**
   ```powershell
   Get-Service -Name "*gestor*"
   ```
   Parado → `Start-Service <nome>` (como administrador).

2. **Subiu e caiu na hora?** Os logs ficam em `server/logs/`:
   ```powershell
   Get-Content server\logs\service-err.log -Tail 40
   ```

3. **Causas mais comuns**, em ordem de frequência:

   | No log aparece | Causa | O que fazer |
   |---|---|---|
   | `EADDRINUSE` | outra coisa já usa a porta | `Get-NetTCPConnection -LocalPort 3000` e decida quem fica |
   | `SQLITE_CANTOPEN` | caminho do `DB_PATH` errado, ou unidade de rede fora | conferir `server/.env` e se o caminho existe |
   | `SQLITE_BUSY` / `database is locked` | duas instâncias abrindo o mesmo banco | garantir que só o serviço está rodando (ninguém com `npm start` aberto) |
   | `Cannot find module` | `npm install` não rodou depois de uma atualização | `npm ci --prefix server` |

4. **Para ver o erro na cara**, sem o serviço no meio:
   ```powershell
   npm start --prefix server
   ```
   Isso escreve no terminal em vez do log. `Ctrl+C` para sair — e **pare o
   serviço antes**, senão os dois brigam pelo mesmo banco.

---

## Ninguém consegue entrar

**Sintoma:** a tela de login aceita a senha e volta para o login, ou diz
"não autenticado" sem explicação.

Quase sempre é **cookie de sessão que não chega**. Três causas conhecidas:

1. **`SESSION_SECURE=true` sem HTTPS.** Com essa opção ligada, o navegador só
   manda o cookie por conexão segura. Se o acesso é `http://192.168.x.x:3000`,
   o cookie nunca volta e o login "não gruda", sem erro nenhum.
   → No `.env`, `SESSION_SECURE=false` para rede local. Reinicie o serviço.

2. **Proxy reverso sem `trust proxy` do lado de lá.** O app já confia em um
   proxy (`app.set("trust proxy", 1)`), mas o proxy precisa repassar
   `X-Forwarded-Proto`. Sem isso, o Express acha que a conexão é HTTP.

3. **`SESSION_SECRET` mudou.** Trocar esse valor invalida todas as sessões —
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
npm run resetar-senha --prefix server -- <usuario> "<nova senha>"
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

4. **O `PUBLIC_URL` está certo?** Esta é a armadilha clássica: se estiver
   `http://localhost:3000`, o link de download que o agente recebe aponta para
   **ele mesmo**, e o download falha sempre. `PUBLIC_URL` tem que ser o endereço
   pelo qual *os outros* enxergam o servidor. Se o IP veio de DHCP e mudou,
   é isto.

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

Pelo painel (**Configurações → Sistema → Backups**), como administrador:

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

3. **Tudo falhando em silêncio, e o acesso é por IP** (não `localhost`): pode
   ser `upgrade-insecure-requests` no cabeçalho CSP mandando o navegador buscar
   tudo por HTTPS, que não existe aqui. Essa diretiva está desligada de
   propósito em `Server.js` — se alguém reativou o padrão do `helmet`, é isso.

4. **Só o estilo sumiu:** `/css/theme.css` ou `/css/components.css` deu 404.

---

## Lentidão

O banco é SQLite com driver **síncrono**, então uma consulta lenta trava o
processo inteiro ([ADR-0002](adr/0002-sqlite-com-better-sqlite3.md)). Com o
volume atual isso é teórico, mas se acontecer:

1. **Confira o tamanho do banco** em **Configurações → Sistema → Saúde**.
2. **Alguém pediu uma página gigante?** O `pageSize` tem teto de 200 no
   servidor, então não é isso — mas exportação de `.xlsx` de milhares de linhas
   é legitimamente pesada e bloqueia enquanto roda.
3. **O arquivo `-wal` cresceu muito?** Acontece quando o banco fica muito tempo
   sem fechar direito. Reiniciar o serviço faz o *checkpoint*.

---

## Espaço em disco

Três coisas crescem sozinhas:

| Pasta | O que é | Pode apagar? |
|---|---|---|
| `server/data/backups/` | cópias do banco na subida | as 10 mais recentes são mantidas automaticamente; as antigas já saem sozinhas |
| `server/data/packages/` | pacotes de versão servidos aos agentes | **cuidado**: um pacote apagado quebra o download de quem ainda não atualizou |
| `server/logs/` | saída do serviço | sim, os rotacionados antigos |

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

E, pelo navegador, **Configurações → Sistema → Saúde**: integridade do banco,
último backup, situação de cada agente, uso de memória e tempo no ar.

`statusGeral` só fica `saudavel` quando a integridade do banco está `ok` **e**
nenhum agente está em erro. Qualquer outra coisa vira `atencao` — que é um
convite a olhar, não necessariamente um incidente.
