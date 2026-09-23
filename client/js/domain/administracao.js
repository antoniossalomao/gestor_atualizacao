/**
 * Regras da tela Administração que não dependem do DOM.
 */

/**
 * O que mudou entre as regras salvas e o que está no formulário -- só as
 * regras listadas em `nomes`, normalizadas para o tipo da definição (o
 * `<input type="number">` devolve texto).
 *
 * Serve a duas coisas: o botão "Salvar" só acende quando isto não está vazio
 * (salvar sem mudar nada gerava um evento vazio no Histórico), e o pedido ao
 * servidor leva só o que mudou -- as outras regras do mesmo formulário não
 * são regravadas por cima de uma alteração que outro admin tenha acabado de
 * fazer em outra aba.
 *
 * @param {Record<string, unknown>} salvas valores atuais, vindos do servidor
 * @param {Record<string, unknown>} formulario valores como estão na tela
 * @param {Record<string, {tipo: string}>} definicoes
 * @param {string[]} nomes regras que este formulário edita
 * @returns {Record<string, unknown>}
 */
export function alteracoesRegras(salvas, formulario, definicoes, nomes) {
  /** @type {Record<string, unknown>} */
  const mudou = {};
  for (const nome of nomes) {
    const tipo = definicoes[nome]?.tipo;
    let valor = formulario[nome];
    if (tipo === "inteiro") {
      const texto = String(valor ?? "").trim();
      // Número inválido vai como está, para o SERVIDOR recusar com a mensagem
      // da regra ("entre 1 e 365") -- converter para NaN aqui perderia isso.
      valor = texto !== "" && Number.isFinite(Number(texto)) ? Number(texto) : texto;
    } else if (tipo === "url") {
      valor = String(valor ?? "").trim();
    }
    if (valor !== salvas[nome]) mudou[nome] = valor;
  }
  return mudou;
}

/**
 * A situação da chave dos agentes (AGENT_API_TOKEN), dita em português. A
 * chave nunca chega ao navegador -- só se ela existe e como termina.
 * @param {{situacao: "ausente"|"exemplo"|"configurada", final?: string}|null|undefined} chave
 * @returns {{texto: string, tom: "ok"|"alerta"|"perigo"}}
 */
export function descreverChaveAgentes(chave) {
  if (chave?.situacao === "configurada") return { texto: `Configurada, terminando em …${chave.final}`, tom: "ok" };
  if (chave?.situacao === "exemplo") {
    return { texto: "Ainda é o valor de exemplo do .env.example, que é público. Troque antes de ligar agentes.", tom: "perigo" };
  }
  return { texto: "Não configurada. Sem ela, nenhum agente consegue falar com o servidor.", tom: "alerta" };
}

/**
 * "3d 4h 12m" a partir de segundos. Zero ou inválido vira "0m": o servidor
 * acabou de subir, e "0s" dava a impressão de relógio parado.
 * @param {number} segundos
 */
export function formatarTempoAtivo(segundos) {
  if (!Number.isFinite(segundos) || segundos < 60) return "menos de 1m";
  const dias = Math.floor(segundos / 86400);
  const horas = Math.floor((segundos % 86400) / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  const partes = [];
  if (dias > 0) partes.push(`${dias}d`);
  if (horas > 0 || dias > 0) partes.push(`${horas}h`);
  partes.push(`${minutos}m`);
  return partes.join(" ");
}

/**
 * Papel normalizado: contas antigas ainda podem vir com "user", que é o
 * operador de hoje (ver requireRole no servidor).
 * @param {string|undefined} role
 * @returns {"admin"|"operador"|"consulta"}
 */
export function papelNormalizado(role) {
  if (role === "admin" || role === "consulta") return role;
  return "operador";
}
