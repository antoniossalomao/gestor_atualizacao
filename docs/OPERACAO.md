# Implantação e Runbook Operacional

Guia único de operação em produção e solução rápida de incidentes (escrito por sintoma). Os caminhos abaixo assumem PowerShell no servidor Windows onde o painel roda.

> **Antes de mexer em dados em produção:** baixe o banco atual pelo painel (**Administração → Backups → Baixar o banco de agora**).

---

## 1. Implantação em produção

Na rede, o painel atende **exclusivamente via HTTPS** ([ADR-0010](ARQUITETURA.md#adr-0010)). Os modelos suportados são **Windows Nativo (NSSM + Caddy)**, **Azure App Service (Instância Web)** e **VM na Azure**.

### 1.1 Windows Nativo com NSSM + Caddy (recomendado para servidores e VMs sem Docker)

Arquitetura: **Node.js** escuta localmente em `127.0.0.1:3000` (`GestorApp`) e o **Caddy Server** atende a porta `443` com HTTPS encaminhando para o Node (`GestorProxy`). Ambos rodam como serviços do Windows via NSSM.

1. **Pré-requisitos** (PowerShell como Administrador):
   ```powershell
   winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
   winget install CaddyServer.Caddy --accept-package-agreements --accept-source-agreements
   winget install nssm --accept-package-agreements --accept-source-agreements
   ```
2. **Copiar o projeto para `C:\gestor`** e instalar dependências do servidor:
   ```powershell
   cd C:\gestor
   npm.cmd run install:all
   ```
3. **Configurar `C:\gestor\server\.env`:**
   ```env
   PORT=3000
   DB_PATH=./data/gestao.db
   SESSION_SECRET=cole-aqui-64-caracteres-hex-gerados-com-crypto
   SESSION_SECURE=true
   TRUST_PROXY=true
   HOST=127.0.0.1
   AGENT_API_TOKEN=cole-aqui-um-token-forte
   ```
   *(Gere chaves aleatórias com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).*
4. **Configurar `C:\gestor\proxy\Caddyfile`:** ajuste o bloco do site com o nome DNS e/ou IP pelo qual a equipe acessa (ou passe via variáveis `GESTOR_ENDERECO` / `GESTOR_IP`):
   ```caddy
   {
     auto_https disable_redirects
     default_sni 192.168.0.109
   }

   gestoratualizacao, 192.168.0.109 {
     tls internal
     reverse_proxy 127.0.0.1:3000
   }
   ```
5. **Registrar serviços no NSSM:**
   ```powershell
   nssm install GestorApp "C:\Program Files\nodejs\node.exe" "C:\gestor\server\server.js"
   nssm set GestorApp AppDirectory "C:\gestor\server"
   nssm start GestorApp

   nssm install GestorProxy "caddy" "run --config C:\gestor\proxy\Caddyfile"
   nssm set GestorProxy AppDirectory "C:\gestor\proxy"
   nssm start GestorProxy
   ```
6. **Instalar certificado raiz nos PCs da equipe** (em rede privada usando `tls internal`):
   ```powershell
   # No servidor, localize root.crt gerado pelo Caddy e copie para um local acessível:
   $cert = Get-ChildItem -Path "$env:AppData\Caddy", "C:\Windows\System32\config\systemprofile\AppData\Roaming\Caddy" -Filter "root.crt" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
   Copy-Item $cert.FullName "C:\gestor\caddy-raiz.crt"

   # Em cada computador da equipe (PowerShell como Administrador):
   certutil -addstore -f Root "C:\caminho\para\caddy-raiz.crt"
   ```
   *(No Firefox, importe o mesmo `.crt` em Privacidade e Segurança → Certificados. Feche e reabra o navegador).*

#### Como atualizar o código no servidor Windows Nativo
```powershell
# 1. Backup preventivo do banco atual
Copy-Item "C:\gestor\server\data\gestao.db" "C:\gestor\server\data\gestao-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss').db"

# 2. Parar o serviço Node
nssm stop GestorApp

# 3. Atualizar os arquivos de código em C:\gestor\
# NUNCA sobrescreva: C:\gestor\server\data\, C:\gestor\server\.env ou C:\gestor\proxy\Caddyfile

# 4. Atualizar dependências e reiniciar
cd C:\gestor
npm.cmd run install:all
nssm start GestorApp
```

### 1.2 Azure App Service (Instância Web)

Compatível com Node.js 22 LTS (Linux ou Windows), deixando a terminação TLS para o balanceador da Azure:

- **App Settings obrigatórias:**
  - `SESSION_SECURE=true` e `TRUST_PROXY=true` *(o servidor aceita `X-Forwarded-Proto` e `X-ARR-SSL`)*;
  - **`HOST=` vazio** *(não defina `127.0.0.1`, pois o roteador da Azure encaminha fora do loopback)*;
  - `SESSION_SECRET` e `AGENT_API_TOKEN` aleatórios fortes;
  - `DB_PATH=/home/data/gestao.db` *(Linux)* ou `D:\home\data\gestao.db` *(Windows)* para manter o banco fora de `wwwroot` (sem `DB_PATH`, o `server.js` já grava em `$HOME/data/gestao.db` quando detecta `WEBSITE_SITE_NAME`).
- **Instância única obrigatória:** mantenha **`Scale Out = 1`** (SQLite não suporta múltiplas instâncias concorrentes sobre o mesmo arquivo).
- **Segurança no Portal:** ative **HTTPS Only**, **TLS mínimo 1.2**, desative **FTP**, aponte o **Health Check** para `/api/auth/status`, restrinja IPs em **Access Restrictions** (ou **Microsoft Entra ID**) e habilite **App Service Backup**.

### 1.3 Máquina Virtual na Azure (VM)

- Use a mesma receita **NSSM + Caddy** acima (`HOST=127.0.0.1`) com SQLite sobre o **Managed Disk SSD** criptografado da VM e **Azure Backup** habilitado.
- No **Network Security Group (NSG)**, libere publicamente apenas a porta `443` (restrita à VPN/IPs da equipe) e mantenha a porta `3000` bloqueada externamente.
- Com domínio DNS público válido, remova `tls internal`, `default_sni` e `auto_https disable_redirects` do `Caddyfile` (e libere a porta `80`) para emissão automática via **Let's Encrypt**.

---

## 2. Runbook por sintoma

| Sintoma | Seção |
|---|---|
| "O painel não abre" / erro de conexão / faixa vermelha "Sem conexão com o servidor" | [Servidor fora do ar](#servidor-fora-do-ar) |
| "Ninguém consegue entrar" (login volta para a tela de login) | [Ninguém consegue entrar](#ninguém-consegue-entrar) |
| "Esqueci minha senha" | [Recuperar acesso](#recuperar-acesso-de-uma-conta) |
| "Sumiu ou foi apagado um registro importante" | [Restaurar backup](#restaurar-um-backup) |
| "A página abre em branco" ou sem estilos | [Página em branco ou sem estilo](#página-em-branco-ou-sem-estilo) |
| "Está lento" ou erro de limite na planilha | [Lentidão](#lentidão) |
| Disco enchendo no servidor | [Espaço em disco](#espaço-em-disco) |
| Preciso trocar a chave dos agentes | [Rotacionar token dos agentes](#rotacionar-o-token-dos-agentes) |
| Agente marcado offline/erro *(quando Atualizador ativo)* | [Agente parou de atualizar](#um-agente-parou-de-atualizar) |

### Servidor fora do ar
1. **No Windows Nativo:** confira `Get-Service GestorApp, GestorProxy` ou `nssm status GestorApp`. Se cair na subida, configure logs no NSSM:
   ```powershell
   nssm set GestorApp AppStdout "C:\gestor\server\log_sucesso.log"
   nssm set GestorApp AppStderr "C:\gestor\server\log_erro.log"
   nssm restart GestorApp
   Get-Content "C:\gestor\server\log_erro.log" -Tail 50
   ```
   - `Cannot find module 'C:\gestor\server.js'`: ajuste `AppParameters` para `C:\gestor\server\server.js` e `AppDirectory` para `C:\gestor\server`.
   - Porta `443` ocupada (`bind: address already in use`): confira com `Get-NetTCPConnection -LocalPort 443` se o IIS ou outro processo usa a porta.
   - `O servidor NÃO foi iniciado: SESSION_SECRET...` ou `SESSION_SECURE...`: corrija `server/.env`.
   - `SQLITE_BUSY`: garanta que apenas uma instância esteja abrindo o mesmo `gestao.db`.
2. **Erro 502 no Caddy:** confira em `C:\gestor\proxy\Caddyfile` se `reverse_proxy` aponta para `127.0.0.1:3000`.
3. **No Azure App Service (403/502):** confira se `HOST` está **vazio**, `SESSION_SECURE=true`, `TRUST_PROXY=true` e `Scale Out = 1`.
4. **Nome DNS não resolve:** confira DNS interno ou `hosts` na máquina do usuário (evite domínios `.local`).

### Ninguém consegue entrar
Quase sempre o cookie `Secure` não está sendo aceito ou assinado:
1. Acesso por `http://` ou direto na porta `3000` sem HTTPS (recusado com 403 em produção).
2. **`SESSION_SECRET` alterado ou resetado para o exemplo** — todas as sessões antigas são invalidadas corretamente; se alguém copiou o `.env.example` sobre o `.env` em produção, gere imediatamente um novo segredo forte e reinicie.

### Recuperar acesso de uma conta
Não há envio de e-mail para recuperação. Quem tem acesso ao host do servidor (ou ao arquivo `gestao.db`) redefine a senha direto no banco:

```powershell
cd C:\gestor\server
node resetar-senha.js <usuario> "<nova senha com 8+ chars>"
```
Funciona inclusive para o único administrador, sem exigir a senha antiga. Se nenhuma conta administradora restar, restaure o backup anterior.

### Restaurar um backup
Em **Administração → Backups e recuperação** (somente `admin`):
1. Clique antes em **Baixar o banco de agora** como cópia de segurança.
2. Selecione o backup pela data, clique em restaurar, digite `RESTAURAR` em maiúsculas e informe sua senha atual.
3. Todas as sessões ativas serão encerradas após a restauração para manter consistência com o banco restaurado. Avise a equipe antes: registros feitos após a cópia restaurada serão perdidos.

### Página em branco ou sem estilo
Abra o DevTools do navegador (`F12 → Console` e `Rede`):
- Erro `Failed to load module script ... MIME type`: um `.js` importado não existe no caminho esperado (o servidor responde `404` explícito, facilitando localizar o import incorreto).
- `404` em `/css/*.css` ou proxy devolvendo erro: confira serviço do Node e diretório `client/`.

### Lentidão
SQLite é síncrono ([ADR-0002](ARQUITETURA.md#adr-0002)). Consultas comuns levam menos de 1 ms; os pontos que seguram o processo são planilhas grandes e arquivo `-wal` acumulado:
- Importação (teto 5.000 linhas) e exportação `.xlsx` (teto 10.000 linhas) possuem limites intencionais em [`limitesPlanilha.js`](../server/src/config/limitesPlanilha.js). Divida a planilha ou filtre por período; antes de alterar os tetos, meça com `node server/ferramentas/medir-planilhas.js`.
- Se o `-wal` crescer muito (monitorado em **Administração → Diagnóstico**), reinicie o serviço `GestorApp` para forçar checkpoint limpo.

### Espaço em disco
- `server/data/backups/`: retenção automática gerenciada pelo painel (padrão 10 cópias recentes); arquivos excedentes são removidos automaticamente.
- `server/data/packages/`: pacotes do Atualizador Automático — não remova pacotes publicados manualmente se agentes ainda dependem deles.

### Rotacionar o token dos agentes
`AGENT_API_TOKEN` é único para todos os agentes C#. Para trocar sem derrubar agentes em silêncio:
1. Gere o novo token aleatório via `crypto.randomBytes(32).toString('hex')`.
2. Atualize o `API_TOKEN` no `atualizador.ini` de **todos** os agentes e reinicie-os (ou coordene a janela de atualização).
3. Troque `AGENT_API_TOKEN` no `server/.env` e reinicie o servidor (`GestorApp`). A tela *Administração → Integrações* mostra se a chave está configurada e seus últimos dígitos.

### Um agente parou de atualizar
*(Aplicável apenas se o módulo Atualizador Automático estiver ligado em **Administração → Integrações**.)*
1. Verifique em *Administração → Integrações* se o Atualizador não está desligado intencionalmente.
2. Na aba *Distribuição*, clique na linha do cliente para ver a última fase e a mensagem de erro.
3. Na máquina do cliente, confira o serviço `Agente Atualizador ERP` (`Get-Service -Name "Agente Atualizador ERP"`), conectividade HTTPS contra `PUBLIC_URL`, instalação do `caddy-raiz.crt` (se certificado privado), eventual pausa no painel e logs no Visualizador de Eventos do Windows.

---

## 3. Conferência rápida de saúde

No servidor de desenvolvimento/homologação:
```powershell
npm run check
npm test
```

Em produção, abra **Administração → Diagnóstico**: confere integridade SQLite (`PRAGMA integrity_check`), tamanho do banco e do `-wal`, sessões ativas, retenção e saúde dos backups, modo de transporte (HTTPS/proxy) e uso de memória do processo. Use **Copiar para o suporte** ao reportar incidentes.
