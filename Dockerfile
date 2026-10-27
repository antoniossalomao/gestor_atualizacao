# Imagem do painel web (Express + SQLite). Para uso, veja a seção "Rodar em
# Docker" do README.md.
#
# Multi-stage: o estágio de build compila/instala tudo; a imagem final é
# "distroless" (só o runtime do Node: sem shell, sem apt, sem npm), o que
# reduz muito o tamanho e a superfície de ataque.
#
# Decisões que não são óbvias:
#
# 1. O build usa Debian (glibc) -- "bookworm-slim" -- e NÃO Alpine, porque a
#    imagem final distroless também é Debian/glibc. O better-sqlite3 é um
#    módulo nativo: um node_modules instalado em Alpine (musl) NÃO carrega em
#    glibc ("Error loading shared library"). Build e runtime precisam ser da
#    mesma família de libc. Mantida a linha Node 22 do projeto (ver ci.yml).
#
# 2. O contexto de build é "web/" inteiro, não "web/server/": a imagem leva o
#    servidor E o front-end, e o servidor procura o front-end dois níveis
#    acima de src/ (CLIENT_DIR em Servidor.js). Por isso o código fica em
#    /app/server e o front-end em /app/client, como em desenvolvimento.

# ---------------------------------------------------------------- build ---
FROM node:22-bookworm-slim AS build

# Ferramentas de compilação: normalmente NÃO são usadas (o better-sqlite3
# acha o binário pronto para linux/glibc). Ficam só para a build não quebrar
# se um dia o binário não existir. Nada disto vai para a imagem final.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Só os manifestos primeiro: enquanto as dependências não mudarem, o Docker
# reaproveita a camada do `npm ci`.
COPY server/package.json server/package-lock.json ./server/

# "--omit=dev": só dependências de produção (sem nodemon).
RUN npm ci --omit=dev --prefix server && npm cache clean --force

# Código do servidor e do front-end, e a "dist" do front-end: o CSS
# (theme.css + components.css) é combinado e minimizado em app.min.css e o
# index.html passa a apontar para ele (ver scripts/build-css.js).
COPY scripts ./scripts
COPY server/package.json server/server.js server/resetar-senha.js ./server/
COPY server/src ./server/src
COPY client ./client
RUN node scripts/build-css.js client \
    # Arquivos de desenvolvimento do front-end não vão para a imagem.
    && rm -rf client/tests client/package.json client/package-lock.json client/tsconfig.json \
    && rm -f client/css/theme.css client/css/components.css

# Pastas de dados criadas AQUI já pertencendo ao uid 1000, de propósito:
# quando um volume nomeado do compose é montado pela primeira vez sobre uma
# pasta que existe na imagem, o Docker copia o conteúdo e o dono dela para o
# volume. Sem isto o volume nasceria como root e o processo (sem privilégios)
# não conseguiria gravar o banco. 1000 = o mesmo uid do usuário "node" da
# imagem antiga, então o volume "gestor-data" já existente continua gravável.
RUN mkdir -p /app/server/data/backups /app/server/data/packages \
    && chown -R 1000:1000 /app/server/data

# ------------------------------------------------------------- runtime ---
# Distroless: entrypoint é o próprio "node" (/nodejs/bin/node); o CMD só
# passa o script. Não há shell nem npm/corepack -- eles carregam a maioria
# dos CVEs de severidade alta que scanners apontam em imagens Node.
FROM gcr.io/distroless/nodejs22-debian12 AS runtime

# O código lê a data do relógio LOCAL para decidir o que é "hoje" (ver
# AgendamentoRepository.venceEmBreve). Container sem TZ roda em UTC e, das
# 21h à meia-noite no horário de Brasília, os agendamentos de amanhã
# apareceriam como atrasados. Ajuste aqui se a equipe não estiver em São Paulo.
ENV TZ=America/Sao_Paulo
ENV NODE_ENV=production

WORKDIR /app/server

# Só o necessário: node_modules de produção + código + front-end já
# compilado (client/ sem testes nem CSS-fonte).
COPY --from=build --chown=1000:1000 /app/server/node_modules ./node_modules
COPY --from=build --chown=1000:1000 /app/server/package.json /app/server/server.js /app/server/resetar-senha.js ./
COPY --from=build --chown=1000:1000 /app/server/src ./src
COPY --from=build --chown=1000:1000 /app/client /app/client
COPY --from=build --chown=1000:1000 /app/server/data ./data

# Não rodar como root. A imagem distroless não tem o usuário "node" no
# /etc/passwd, então usa-se o uid/gid numérico dele (1000), que é o dono dos
# arquivos acima e do volume de dados.
USER 1000:1000

EXPOSE 3000

# Confere a saúde pela mesma rota que o front-end chama ao abrir a página:
# "/api/auth/status" é pública, e responder exige que o banco esteja aberto.
# Forma exec (sem shell): a imagem não tem /bin/sh.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/auth/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["server.js"]
