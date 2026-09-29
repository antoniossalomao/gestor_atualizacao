const crypto = require("crypto");

const { tokensIguais } = require("./requireAgent");

/**
 * Proteção contra CSRF (P02 de docs/MELHORIAS.md): uma página de OUTRA
 * origem, aberta no navegador de quem está logado, não consegue mandar o
 * painel alterar nada em nome dessa pessoa.
 *
 * Como funciona: cada sessão logada tem um token aleatório guardado nela
 * (`req.session.csrf`). O servidor entrega o token no cabeçalho de resposta
 * X-CSRF-Token de toda chamada à API feita com sessão; o ApiClient guarda o
 * último que viu e o devolve no mesmo cabeçalho em todo POST/PUT/PATCH/DELETE.
 * Outra origem não lê resposta nossa (sem CORS, o navegador não deixa), então
 * não tem como saber o token -- e sem ele a escrita é recusada com 403 antes
 * de chegar ao controller, antes até de o multer gravar um upload.
 *
 * Por que token, e não só conferir o cabeçalho Origin (decisão de 29/09/2026,
 * ADR-0011 na documentação consolidada):
 * - O cookie já é SameSite=Lax e a API só entende JSON, o que barra a maior
 *   parte dos ataques -- mas não todos: um <form> de outra página manda
 *   multipart (importação de planilha, envio de pacote) e POST sem corpo
 *   (publicar/promover/reverter versão, sair) sem preflight, e o SameSite
 *   trata como "o mesmo site" outros serviços da mesma rede/domínio. A
 *   proteção do painel não pode depender desses detalhes continuarem assim.
 * - Conferir o Origin exige comparar com o endereço pelo qual o painel foi
 *   acessado -- nome, IP ou localhost, passando pelo proxy --, e extensões de
 *   privacidade às vezes removem o cabeçalho. O token só depende do nosso
 *   código, e o teste dele não depende de navegador.
 *
 * O que fica de fora, de propósito:
 * - GET/HEAD/OPTIONS: não alteram nada (e não podem passar a alterar).
 * - Pedido sem usuário na sessão: não há o que roubar. As rotas protegidas
 *   respondem 401 logo depois (requireAuth), e a mensagem certa para "sessão
 *   expirada" é essa, não "token inválido". Cobre também os agentes C#
 *   (/api/update/...), que se autenticam por X-Agent-Token e não têm cookie.
 * - Login e configuração inicial: não há sessão logada antes deles, então
 *   não há token para exigir. Contra outra página tentando enviá-los, basta o
 *   que já existe: são JSON (outra origem não manda JSON sem preflight, que
 *   o servidor não autoriza) e passam pelo limitador de tentativas. Ficam
 *   liberados mesmo COM sessão: outra aba pode estar na tela de login com a
 *   sessão já aberta aqui, e entrar de novo precisa funcionar.
 */

const CABECALHO = "X-CSRF-Token";
const METODOS_SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);
/** Caminhos relativos a /api (o middleware roda dentro do ApiRouter). */
const SEM_SESSAO_ANTES = new Set(["POST /auth/login", "POST /auth/setup"]);

const MENSAGEM =
  "Não foi possível confirmar que este pedido saiu do próprio painel. Recarregue a página (F5) e tente de novo.";

/** Token da sessão, criado na primeira vez que for pedido. */
function garantirTokenCsrf(session) {
  // Sessões abertas antes desta proteção existir não têm token: ganham um
  // aqui, na primeira chamada depois da atualização, sem ninguém precisar
  // sair e entrar de novo.
  if (!session.csrf) session.csrf = crypto.randomBytes(32).toString("base64url");
  return session.csrf;
}

/** @type {import("express").RequestHandler} */
function protecaoCsrf(req, res, next) {
  const session = req.session;
  if (!session?.user) return next();

  const token = garantirTokenCsrf(session);
  res.set(CABECALHO, token);

  if (METODOS_SEGUROS.has(req.method) || SEM_SESSAO_ANTES.has(`${req.method} ${req.path}`)) return next();

  const enviado = req.get(CABECALHO);
  if (enviado && tokensIguais(enviado, token)) return next();
  // `codigo` é o que o ApiClient usa para distinguir esta recusa de um 403
  // de permissão: nesta, ele busca o token atual e repete o pedido uma vez
  // (ver ApiClient). A mensagem só aparece se nem assim der certo.
  res.status(403).json({ error: MENSAGEM, codigo: "csrf" });
}

module.exports = { protecaoCsrf, garantirTokenCsrf, CABECALHO_CSRF: CABECALHO };
