/**
 * Middleware para controle de acesso baseado em papéis (RBAC).
 *
 * Papéis suportados:
 *  - "admin": Acesso total a todas as operações, inclusive configurações e restauração de backups.
 *  - "operador": Acesso operacional (CRUD de clientes, agendamentos, atualizações e rascunhos de versão).
 *                Contas legadas com 'user' são tratadas de forma idêntica a 'operador'.
 *  - "consulta": Acesso estritamente somente-leitura e exportação.
 *
 * Exemplo de uso nas rotas:
 *   api.post("/versoes/:id/publicar", requireRole("admin"), versoes.publish);
 *   api.post("/clientes", requireRole("operador", "admin"), clientes.create);
 */
function requireRole(...rolesPermitidas) {
  const permitidos = new Set(rolesPermitidas);
  if (permitidos.has("operador")) {
    permitidos.add("user"); // retrocompatibilidade com contas legadas
  }

  return (req, res, next) => {
    const user = req.session?.user;
    if (!user) {
      res.status(401).json({ error: "Não autenticado." });
      return;
    }

    const papelAtual = user.role || "consulta";
    if (!permitidos.has(papelAtual)) {
      // Não expõe papelAtual nem papeisPermitidos na resposta: em produção
      // essa informação diz ao atacante exatamente o que ele tem e o que
      // precisa para passar. A mensagem genérica é suficiente para o
      // usuário legítimo entender que não tem a permissão necessária.
      res.status(403).json({
        error: "Acesso não autorizado: seu perfil não tem permissão para executar esta operação.",
      });
      return;
    }

    next();
  };
}

module.exports = { requireRole };

