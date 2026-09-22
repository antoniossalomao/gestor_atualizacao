# Imagem do painel web (Express + SQLite). Para uso, veja a seção "Rodar em
# Docker" do README.md.
#
# Duas decisões que não são óbvias e explicam o formato deste arquivo:
#
# 1. A base é "bookworm-slim" (Debian/glibc), NÃO Alpine. O better-sqlite3 é
#    um módulo nativo: em glibc ele baixa um binário pronto e a instalação
#    leva segundos; em Alpine (musl) não há binário publicado e toda build
#    teria que compilar o SQLite do zero. A imagem fica maior, a build fica
#    muito mais rápida e previsível.
#
# 2. O contexto de build é "web/" inteiro, não "web/server/". O
#    server/package.json declara `"gestor-de-atualizacoes": "file:.."` --
#    o pacote da raiz --, então sem o package.json de cima o `npm ci` falha
#    antes de começar. É também por isso que os caminhos são /app e
#    /app/server nos DOIS estágios: o npm grava esse vínculo como um link
#    simbólico relativo dentro de server/node_modules, e um link relativo só
#    continua apontando para o lugar certo se a estrutura de pastas for
#    idêntica na imagem final.

# ---------------------------------------------------------------- build ---
FROM node:22-bookworm-slim AS build

# Ferramentas de compilação: normalmente NÃO são usadas (o better-sqlite3
# acha o binário pronto para linux/glibc e nem chega a compilar). Estão aqui
# para a build não quebrar se um dia o binário da versão em uso não existir
# para a plataforma -- nesse caso ele compila, demora alguns minutos e
# funciona igual. Nada disto vai para a imagem final.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Só os manifestos primeiro: enquanto as dependências não mudarem, o Docker
# reaproveita a camada do `npm ci` e a build de uma alteração de código leva
# segundos em vez de reinstalar tudo.
COPY package.json ./
COPY server/package.json server/package-lock.json ./server/

# "--omit=dev" deixa de fora o nodemon e o typescript: dentro do container
# não há reinício automático a cada arquivo salvo nem verificação de tipos --
# isso é trabalho da máquina de desenvolvimento.
RUN npm ci --omit=dev --prefix server

# ------------------------------------------------------------- runtime ---
FROM node:22-bookworm-slim AS runtime

# O código lê a data do relógio LOCAL para decidir o que é "hoje" (ver
# AgendamentoRepository.dueSoon). Container sem TZ roda em UTC: das 21h à
# meia-noite, horário de Brasília, o servidor já estaria no dia seguinte e
# os agendamentos de amanhã apareceriam como atrasados no sino de
# notificações -- errado em silêncio, sem erro nenhum no log. Ajuste aqui se
# a equipe não estiver em São Paulo.
ENV TZ=America/Sao_Paulo
ENV NODE_ENV=production

WORKDIR /app/server

# O CLI do npm que vem dentro da imagem base -- não os pacotes do projeto,
# o npm em si, usado só em "docker build" (RUN npm ci acima) -- nunca é
# chamado depois do build: o CMD no fim deste arquivo roda "node server.js"
# direto. Ele carrega junto suas próprias dependências internas (tar,
# minimatch/brace-expansion...), e são exatamente essas que respondem pela
# maioria dos CVEs de severidade alta/crítica que o Docker Scout aponta
# nesta imagem -- risco real de RCE em código que nunca executa em
# produção, só ocupando espaço e sujando todo relatório de segurança
# futuro. Corepack (gerenciador de gerenciadores de pacote) tampouco tem
# uso aqui. Indo embora os dois, sobra só o runtime do Node.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# node_modules vem pronto do estágio de build (incluindo o binário nativo do
# better-sqlite3 já compatível com esta imagem).
COPY --from=build /app/server/node_modules ./node_modules
COPY --chown=node:node package.json /app/package.json
COPY --chown=node:node server/package.json server/server.js server/resetar-senha.js ./
COPY --chown=node:node server/src ./src
COPY --chown=node:node server/scripts ./scripts
COPY --chown=node:node client /app/client

# Pastas de dados criadas AQUI, já pertencendo ao usuário "node", de
# propósito: quando um volume nomeado do compose é montado pela primeira vez
# sobre uma pasta que existe na imagem, o Docker copia o conteúdo e o dono
# dela para o volume. Sem isto, o volume nasceria pertencendo ao root e o
# processo (que não roda como root) não conseguiria gravar o banco.
RUN mkdir -p /app/server/data/backups /app/server/data/packages /app/server/logs \
    && chown -R node:node /app/server/data /app/server/logs

# Não rodar como root. O "node" é um usuário sem privilégios que já vem na
# imagem oficial (uid 1000).
USER node

EXPOSE 3000

# Confere a saúde pela mesma rota que o front-end chama ao abrir a página:
# "/api/auth/status" é pública (não exige login), e responder exige que o
# banco esteja aberto e consultável -- ou seja, mede o que interessa, e não
# só "o processo está de pé". A checagem usa o próprio node porque a imagem
# slim não tem curl nem wget, e instalar um só para isso seria pagar uma
# camada à toa.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/auth/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
