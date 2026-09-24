# ADR-0007 — Sistemas e clientes em tabelas de ligação, com migrações numeradas

**Situação:** Aceita (setembro de 2026)

## Contexto

Três campos do banco guardavam listas ou vínculos como texto:

- `atualizacoes.sistema` — a lista de sistemas de um atendimento, separada por
  vírgula (`"B_Vendas, B_NFe"`). Em produção, 866 dos 945 atendimentos tinham
  mais de um sistema.
- `clientes.sistemas` — a mesma coisa para os sistemas de cada cliente.
- `atualizacoes.cliente` e `agendamentos.cliente` — o **nome** do cliente,
  sem id.

Por cima disso, a versão oficial por sistema (setembro de 2026) acrescentou
`atualizacoes.versoes_sistemas`, um JSON `{sistema: versão}` que repetia a lista.

O custo aparecia de três formas:

1. **Toda leitura reinterpretava texto.** Quebrar a lista por vírgula e
   comparar nomes "sem caixa, acento nem prefixo `B_`" estava espalhado em seis
   arquivos (`splitSystems`, `sameSystem`, `versaoDoRegistro`, `splitSistemas`,
   `versaoRegistrada`…). Cada tela nova precisava lembrar de todas as regras.
2. **O catálogo não garantia nada.** `B_NFCe` (100 usos), `B_Sped` (53), `CTe`,
   `B_Rat` e outros apareciam no histórico sem existir na tabela `sistemas`, e
   o mesmo sistema tinha grafias diferentes (`B_NFE`/`B_NFe`, `DFE`/`B_DFe`).
   A comparação aproximada escondia isso na maior parte das telas, mas não em
   todas: a situação do cliente listava `NFCe` e `B_NFCe` como dois sistemas.
3. **O vínculo com o cliente era frágil.** Renomear um cliente exigia reescrever
   o nome em duas outras tabelas, e 57 atendimentos já não batiam com cliente
   nenhum.

E o jeito de mudar o esquema — `ALTER TABLE ADD COLUMN` em try/catch, repetido a
cada boot — servia para acrescentar coluna, mas não para mover dado de uma
coluna para uma tabela e apagar a coluna.

## Decisão

**Migrações numeradas** (`server/src/database/migracoes.js`). O número da última
aplicada fica em `PRAGMA user_version`. Cada migração roda uma vez, em ordem,
numa transação. Antes de aplicar qualquer migração pendente, o servidor copia o
banco para `backups/` e confere a cópia com `integrity_check`; se a cópia falhar,
a subida é interrompida. O bloco antigo de `ALTER TABLE` virou
`Database._esquemaLegado` e só roda em banco ainda na versão 0.

**Migração 1:**

| Antes | Depois |
|---|---|
| `atualizacoes.sistema` (texto) + `versoes_sistemas` (JSON) | `atualizacao_sistemas (atualizacao_id, sistema_id, ordem, versao)` |
| `clientes.sistemas` (texto) | `cliente_sistemas (cliente_id, sistema_id, ordem)` |
| cliente por nome | `cliente_id` em `atualizacoes` e `agendamentos` (`ON DELETE SET NULL`) |
| excluir sistema apagava a linha | `sistemas.ativo`: excluir desativa |

- **Sistemas fora do catálogo viram inativos.** O histórico continua apontando
  para eles, e eles não aparecem nas telas de cadastro. Cadastrar de novo o
  mesmo nome reativa a mesma linha, com o histórico junto. As grafias de um
  mesmo sistema viram uma linha só, com o nome mais usado.
- **O nome do cliente continua em `atualizacoes.cliente`**, como cópia: é o que
  se mostra quando o cliente é excluído ou quando o atendimento foi lançado para
  um nome sem cadastro. Enquanto existe vínculo, a cópia acompanha o rename.
  Cadastrar um cliente com o nome de atendimentos sem vínculo passa a ligá-los
  a ele.
- **`versoes_por_sistema`** distingue o atendimento cuja versão foi capturada
  sistema a sistema do registro legado, em que a verdade é o texto livre de
  `versao`. No legado, a versão só vira a versão de um sistema quando o
  atendimento tinha um sistema só; com vários, fica nula, porque é ambígua.
- **Visões `atualizacoes_v` e `clientes_v`** montam de volta as listas em texto,
  no formato que a API sempre entregou. Por isso o front-end não mudou: `sistema`
  continua `"B_Vendas, B_NFe"` e `versoes_sistemas` continua um JSON (nulo para
  o legado).

## Consequências

- Relatórios por sistema, o Resumo e a situação do cliente viraram consultas
  SQL por id, com `ROW_NUMBER()` para "o último atendimento". O ensaio numa cópia
  do banco de produção comparou o código antigo com o novo: relatório por
  sistema (com e sem data de corte), Resumo e última versão por sistema saíram
  idênticos. As únicas diferenças foram as grafias corrigidas e o desempate de
  dois atendimentos no mesmo dia, que agora é sempre pelo último registrado.
- A regra "qual sistema um nome quer dizer" existe num lugar só:
  `SistemaRepository.resolver`/`resolverOuCriar`. Ela roda na gravação; a
  leitura só compara ids.
- **Mudança de esquema nova é uma migração nova** em `migracoes.js`, nunca de
  volta em `_esquemaLegado`.
- O que **não** mudou, de propósito: datas continuam `dd/mm/aaaa` em texto
  (trocar mexeria na API, no front e na importação inteira), e `responsavel`
  continua texto, porque há pessoas na equipe sem conta no sistema.
- `scripts/normalizar-historico.js` foi removido: gravava direto na coluna que
  deixou de existir, e a migração 1 refaz aquela normalização.
- Para voltar atrás, é preciso a imagem anterior **e** o backup de antes da
  migração, porque o código antigo não lê o esquema novo.
