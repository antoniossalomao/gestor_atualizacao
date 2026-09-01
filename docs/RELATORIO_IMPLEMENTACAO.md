# Relatorio de implementacao

Data: 2026-08-26 (atualizado em 2026-08-27, apos auditoria contra binarios e base reais)

## Entregue

- Corrigido o XML do projeto .NET e o namespace invalido da inicializacao.
- Corrigidos os argumentos com aspas do GFIX, GBAK, BScript e 7za.
- O agente passou a usar configuracao por variaveis de ambiente.
- O cliente C# agora usa a URL configurada em `ATUALIZADOR_API_URL`.
- O contrato JSON foi alinhado: `update_available` e `sha256`.
- Downloads validam nome de arquivo e SHA-256 antes de continuar.
- Endpoints de consulta, download e log exigem o header `X-Agent-Token`.
- O token da API e a URL publica passaram a ser configuraveis no servidor.
- Execucao de processos e extracao passaram a ser assincronas e cancelaveis.
- Falhas de qualquer processo externo agora interrompem a atualizacao.
- O agente nao trata mais falha de conexao com Firebird como estado normal.
- A ausencia do `7za.exe` agora interrompe o ciclo em vez de marcar a atualizacao como pronta.
- O rollback tenta restaurar `JUNIOR_PRE.fbk` antes de colocar o banco online.
- Credenciais do Firebird nao ficam mais gravadas no codigo nem nos logs de argumentos.
- A dependencia explicita vulneravel do `System.Text.Json` foi removida.

### Correcoes de 2026-08-27 (apos auditoria contra `BScript.exe`, `BEXE.FDB` e scripts reais)

- **Toda chamada a processo externo agora tem timeout obrigatorio e mata o processo se
  estourar.** O `BScript.exe` real, inspecionado por engenharia reversa de strings, nao
  apresenta nenhuma evidencia de suporte a linha de comando/modo silencioso — parece ser um
  formulario Delphi/FireDAC interativo. Sem timeout, chama-lo dentro do servico Windows (sem
  desktop interativo) podia travar `Process.WaitForExitAsync()` para sempre com o banco em
  `-shut force_0`, bloqueado para todo mundo.
- **`VERSAO_NOVA` volta ao valor anterior quando a atualizacao falha.** Antes, o campo era
  gravado com a versao-alvo assim que o download terminava (Fase 1) e nunca era revertido em
  caso de erro na Fase 3 — o proximo polling comparava a versao publicada com a versao que
  tinha acabado de falhar, via ela como "igual", e parava de tentar para sempre, sem qualquer
  aviso. Agora a versao anterior e salva num arquivo local antes de sobrescrever o campo, e
  restaurada no bloco de erro.
- **`InjetarNovosBinarios` reescrito contra o schema real do `BEXE.fdb`.** Abrindo o
  `BEXE.FDB` de producao encontrado em `Arquivos para analise/` e lendo os metadados do
  Firebird, a tabela real e `EXECUTAVEIS` (`NOMEPRODUTO`, `NOMEARQUIVO`, `VERSAO`,
  `VERSAOATUALIZADA`, `EXECUTAVEL`, `HASHEXE`, `DATA_ATUALIZACAO`) — nao `VERSOES_EXE` /
  `NOME_EXE` / `ARQUIVO_BLOB` como o codigo assumia. A injecao tambem passou a rodar numa
  unica transacao (evita terminais lendo uma mistura de binarios antigos e novos numa falha
  parcial) e a preencher `HASHEXE` com o SHA-256 do executavel.
- **Porta do Firebird configuravel** via `ATUALIZADOR_DB_PORT` (padrao `3050`) — um
  `BScript.Ini` real de producao usa `3051`, e o agente nao tinha como se conectar nesse tipo
  de ambiente.
- **`MENSAGEM_LOG` passou a ser escrito** em `SYS_ATUALIZACAO` quando uma atualizacao falha,
  alem do log enviado (em best-effort) para a API central.
- **Backoff apos falha:** o laco principal, antes fixo em 10s, agora cresce (1, 2, 4... ate 30
  minutos) apos falhas consecutivas, e volta a 10s assim que um ciclo saudavel acontece — evita
  martelar disco/rede a cada 10 segundos quando algo esta persistentemente quebrado.
- **`script_url` agora e baixado e usado.** O contrato da API ja previa distribuir o proprio
  `BScript.exe` por versao publicada; o agente ignorava esse campo e sempre usava o caminho
  fixo do servidor. Agora, se a versao publicada tiver `script_url`, o agente baixa o arquivo
  na Fase 1 e o usa na Fase 3 em vez do caminho fixo.
- **Credenciais do Firebird passaram a usar `ArgumentList`** em vez de uma unica string
  interpolada nos comandos `gfix`/`gbak` — uma senha com espaco ou aspas antes podia quebrar o
  parsing dos argumentos.
- **Extracao passou a receber a lista exata de arquivos baixados**, em vez de varrer a pasta
  por extensao (`.7z`/`.rar`/`.zip`) — um pacote com extensao inesperada antes era ignorado em
  silencio.

## Configuracao obrigatoria do servidor web

No arquivo `web/server/.env`, definir valores reais:

```env
SESSION_SECRET=um-segredo-longo-e-aleatorio
AGENT_API_TOKEN=um-token-longo-e-aleatorio
PUBLIC_URL=http://IP-DO-SERVIDOR:3000
```

`AGENT_API_TOKEN` deve ser mantido em segredo e ser igual ao valor configurado no servico C#.
Em producao, usar HTTPS e `SESSION_SECURE=true`.

## Configuracao obrigatoria do agente C#

Definir no ambiente do servico Windows:

```text
ATUALIZADOR_API_URL=https://servidor.exemplo/api
ATUALIZADOR_API_TOKEN=mesmo-token-do-servidor
ATUALIZADOR_CNPJ=cnpj-do-cliente
ATUALIZADOR_DB_USER=SYSDBA
ATUALIZADOR_DB_PASSWORD=senha-do-firebird
ATUALIZADOR_DB_PORT=3050
ATUALIZADOR_JUNIOR_FDB=C:\ERP\JUNIOR.fdb
ATUALIZADOR_BEXE_FDB=C:\ERP\BEXE.fdb
ATUALIZADOR_GFIX_PATH=C:\Program Files (x86)\Firebird\Firebird_2_5\bin\gfix.exe
ATUALIZADOR_GBAK_PATH=C:\Program Files (x86)\Firebird\Firebird_2_5\bin\gbak.exe
ATUALIZADOR_BSCRIPT_PATH=C:\ERP\BScript.exe
ATUALIZADOR_TEMP_PATH=C:\TempUpdates
```

O arquivo `7za.exe` precisa estar ao lado do executavel publicado do agente.

## Validacoes realizadas

- `dotnet build Atualizador automatico/AtualizadorERP.csproj`: aprovado sem avisos (2026-08-26 e novamente em 2026-08-27, apos as correcoes acima).
- `node --check web/server/server.js`: aprovado.
- `GET /api/auth/status`: servidor respondeu normalmente.

## Pendencias que exigem ambiente real

1. Confirmar nomes e tipos reais de `SYS_ATUALIZACAO` em `JUNIOR.fdb` (nenhuma copia desse
   banco estava disponivel para inspecao — so o `BEXE.fdb` foi confirmado).
2. ~~Confirmar tabela e campos de BLOB em `BEXE.fdb`~~ — **resolvido em 2026-08-27** por
   engenharia reversa do `BEXE.FDB` real: tabela `EXECUTAVEIS`, campos `NOMEPRODUTO`,
   `NOMEARQUIVO`, `VERSAO`, `VERSAOATUALIZADA`, `EXECUTAVEL`, `HASHEXE`,
   `DATA_ATUALIZACAO`. Codigo em `DatabaseService.cs` ja atualizado.
3. **Confirmar se o `BScript.exe` aceita algum modo de linha de comando — piorou de "verificar"
   para "risco ativo".** A engenharia reversa do binario real nao encontrou nenhuma string de
   parsing de CLI e encontrou fortes evidencias de que e um programa grafico interativo
   (formulario com campos de servidor/banco/pasta, selecao manual de arquivo, botao "Inserir
   No Banco Como Executado" separado da execucao). O codigo agora tem um timeout de seguranca
   (10 min, mata o processo) para nao travar o servidor indefinidamente, mas isso e uma rede de
   protecao, nao uma solucao — sem confirmar um modo headless real (ou substituir a ferramenta),
   nenhum piloto deveria depender da Fase 3 atual.
4. Validar o comando de restauracao `gbak -c -replace_database` na versao Firebird instalada.
5. Implementar no Delphi a leitura de `PENDENTE`, confirmacao do usuario e gravacao de `AUTORIZADO`.
6. Publicar o agente como servico Windows e testar permissao de acesso aos dois bancos.
7. Criar testes de integracao usando uma copia descartavel dos bancos antes do primeiro cliente.
8. Decidir a convencao real de `NOMEPRODUTO` em `EXECUTAVEIS` — o codigo usa o nome do arquivo
   sem extensao como padrao; confirmar se e isso mesmo que os terminais esperam.
9. Os 1026 scripts em `Scripts-BVendas/` nao tem protecao contra reexecucao (`IF NOT EXISTS`
   ou equivalente) e o `BScript.exe` so registra "executado" por um clique manual — decidir
   como o agente vai saber quais scripts uma versao especifica exige, em vez de apontar para a
   pasta inteira de historico.

## Observacao de seguranca

Nao usar `masterkey` em producao. O token do agente e a senha do Firebird devem ser armazenados no mecanismo de configuracao seguro do Windows ou em variaveis protegidas do servico, nunca no repositorio.
