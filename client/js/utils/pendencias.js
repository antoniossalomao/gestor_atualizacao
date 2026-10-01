/**
 * Quem tem alteração digitada e ainda não salva -- para avisar antes de a
 * pessoa perder isso.
 *
 * Trocar de tela não perde nada (as telas ficam montadas, e os formulários de
 * regras não se recarregam por cima do que está sujo). Perde-se em dois
 * momentos: recarregar ou fechar a página, e sair da conta, que desmonta o
 * app inteiro. Cada formulário se registra aqui com uma função que diz, em
 * palavras, o que ele tem pendente (ou `null`); o esqueleto do app pergunta
 * nesses dois momentos.
 */
export class RegistroDePendencias {
  constructor() {
    /** @type {Set<() => string | null>} */
    this.fontes = new Set();
  }

  /**
   * @param {() => string | null} fonte devolve a descrição do que está pendente, ou `null`
   * @returns {() => void} desfaz o registro (chamar no `destroy` de quem registrou)
   */
  registrar(fonte) {
    this.fontes.add(fonte);
    return () => this.fontes.delete(fonte);
  }

  /** As descrições do que está pendente agora, sem repetição. */
  lista() {
    const itens = [];
    for (const fonte of this.fontes) {
      let texto = null;
      try {
        texto = fonte();
      } catch {
        // Uma fonte quebrada não pode impedir as outras de avisar.
      }
      if (texto && !itens.includes(texto)) itens.push(texto);
    }
    return itens;
  }
}
