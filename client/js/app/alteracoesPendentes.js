import { RegistroDePendencias } from "../utils/pendencias.js";

/**
 * O registro único do app (ver utils/pendencias.js) e o aviso do navegador ao
 * recarregar ou fechar a página. O texto desse aviso é o do navegador -- ele
 * não deixa a página escrever o próprio desde 2016 --, mas aparecer já evita
 * a perda.
 */
export const alteracoesPendentes = new RegistroDePendencias();

window.addEventListener("beforeunload", (e) => {
  if (alteracoesPendentes.lista().length === 0) return;
  e.preventDefault();
  e.returnValue = "";
});
