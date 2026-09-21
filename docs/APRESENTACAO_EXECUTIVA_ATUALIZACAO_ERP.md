# Automação da Atualização de ERP nos Servidores dos Clientes

### Apresentação Executiva, Técnica e de Status Operacional
**Gestor de Atualizações + Agente Atualizador ERP**  
*Bredas Sistemas · Setembro de 2026*  
*Preparado por: Antonio Salomão*

> **Resumo Executivo:**  
> Transformação do processo de atualização de ERP de um modelo 100% manual, demorado e arriscado (via AnyDesk máquina por máquina) em uma esteira segura, automatizada, padronizada e monitorada em tempo real por um painel central de comando.

---

## 1. O Problema que Motivou o Projeto

Hoje, cada nova versão do ERP (com melhorias fiscais, novas telas ou correções) exige da equipe de suporte um procedimento manual e repetitivo para cada cliente da carteira.

### Como funciona o modelo manual atual (Gargalo Operacional)
1. O suporte agenda um horário com o cliente.
2. Conecta no servidor do cliente via **AnyDesk** ou TeamViewer.
3. Executa manualmente uma sequência de 8 passos delicados:
   - Solicitar a saída de todos os usuários do sistema;
   - Realizar backup de segurança do banco Firebird;
   - Renomear os executáveis legados na pasta do sistema;
   - Copiar manualmente os novos executáveis baixados;
   - Abrir ferramenta de banco e rodar scripts SQL de atualização;
   - Conferir manualmente logs e integridade de tabelas/colunas;
   - Gerar um novo backup pós-atualização;
   - Abrir o sistema em uma estação para testar o login.
4. Repete exatamente esse processo em **cada um dos clientes da carteira**.

### As dores e custos desse modelo
* **Tempo e custo excessivo de suporte:** Cada cliente consome de 30 a 60 minutos de um técnico. Atualizar 50 clientes consome de 30 a 50 horas de suporte apenas com cópia de arquivos e espera de telas.
* **Risco humano no banco de dados:** Quedas de conexão no AnyDesk, ordens trocadas de scripts SQL ou passos esquecidos podem corromper o banco Firebird do cliente e paralisar a operação da empresa.
* **Falta de visibilidade central:** Sem um lugar centralizado para responder rapidamente: *"Quantos clientes já estão na versão nova?", "Quem ainda está desatualizado?", "Quando foi a última atualização do cliente X?"*.
* **Gargalo para expansão:** A carteira de clientes não consegue escalar sem aumentar proporcionalmente a equipe de suporte apenas para atualizações.

---

## 2. Visão Geral da Solução: Os Dois Pilares

O projeto ataca o problema em duas frentes complementares, conectadas por uma API central segura:

```
[ BREDAS SISTEMAS ]                               [ SERVIDOR DO CLIENTE ]
 ┌───────────────────────────┐                     ┌─────────────────────────────┐
 │   GESTOR DE ATUALIZAÇÕES  │◄──── Conexão ──────►│   AGENTE ATUALIZADOR ERP    │
 │       (Painel Web)        │      Segura (API)   │      (Serviço Windows C#)   │
 └───────────────────────────┘                     └─────────────────────────────┘
  • Central de comando da equipe                    • Robô local silencioso
  • Publica versões e scripts                       • Baixa, valida e aplica
  • Monitora incidentes e telemetria                • Isola banco e roda scripts
  • Controle de acessos e auditoria                 • Atualiza terminais sozinho
```

| Componente | O que é | Onde roda | Papel no negócio |
|---|---|---|---|
| **Gestor de Atualizações** *(Central de Comando)* | Painel web corporativo em Node.js + Express + SQLite, acessível pelo navegador. | Servidor interno da Bredas. | Onde a equipe publica versões, gerencia clientes, controla acessos, acompanha status de agentes em tempo real e visualiza métricas. |
| **Agente Atualizador ERP** *(Assistente Local)* | Serviço Windows nativo e silencioso em C# (.NET 8). | Servidor local de cada cliente (ao lado do Firebird). | Executa sozinho todo o processo: consulta a API, baixa versão, valida integridade, aplica scripts SQL, atualiza executáveis e reporta o status. |

### Como os dois conversam (Segurança e Arquitetura)
* **Conexão Segura de Dentro para Fora (Outbound Polling):** O agente consulta a API da Bredas via internet com token compartilhado seguro. Não há portas abertas nem necessidade de IP fixo no servidor do cliente, operando normalmente atrás de roteadores e firewalls (NAT).
* **Operação Silenciosa:** Se não houver versão nova, o agente volta a dormir sem consumir memória ou CPU.
* **Telemetria e Alertas Imediatos:** O agente reporta logs detalhados e tempos de execução. Se houver qualquer falha ou se um agente ficar sem contato por mais de 24 horas, o painel web acende alerta visual imediato e notifica a equipe via **Discord**.

---

## 3. O Fluxo das 4 Fases: Segurança em Primeiro Lugar

Para garantir risco zero de parada na operação do cliente, o agente foi projetado com uma esteira estrita de **4 Fases sequenciais blindadas**:

### ┌ Fase 1: Preparo Silencioso (Download e Validação)
* O agente baixa o pacote da versão nova em segundo plano pela internet.
* **Validação Criptográfica (SHA-256):** O agente valida se o arquivo baixado é exatamente idêntico ao gerado na Bredas. Se a conexão oscilar ou o arquivo corromper, o pacote é descartado imediatamente.
* O cliente continua trabalhando normalmente sem perceber nenhuma lentidão.

### ├ Fase 2: Permissão e Respeito ao Cliente (Autorização)
* O sistema **nunca derruba o cliente de surpresa**.
* Quando o pacote está pronto, o próprio ERP Delphi avisa o usuário do cliente em momento oportuno:  
  *"Uma nova versão está pronta. Deseja aplicar a atualização agora? [Sim] [Lembrar mais tarde]"*
* O cliente escolhe a melhor hora (final do expediente ou intervalo de almoço). Quando ele confirma, o ERP grava a autorização na tabela de controle e o agente assume o processo.

### ├ Fase 3: Execução Crítica com Escudo Total (Banco Firebird & Scripts)
* O agente desconecta os usuários externos do banco via comando nativo (`gfix -shut`).
* **Backup de Segurança Obrigatório:** Antes de tocar em qualquer dado, o agente gera um backup completo do banco Firebird via `gbak`.
* **Aplicação Transacional dos Scripts SQL:** O motor próprio do agente executa os scripts em duas passadas (resolvendo dependências entre tabelas, procedures e triggers) com isolamento `SET TERM ^ ;`.
* **Rollback Automático Garantido:** Se qualquer comando SQL falhar ou faltar energia, o agente interrompe o processo, restaura o backup inicial e devolve o banco ao ar no estado funcional anterior. **O cliente nunca amanhece com o sistema quebrado.**

### └ Fase 4: Distribuição Automática para os Terminais
* O agente grava os novos executáveis na tabela central (`BEXE.fdb`).
* As estações e caixas da rede local baixam os executáveis atualizados diretamente do servidor local ao abrirem o ERP, sem precisar atualizar máquina por máquina.
* O agente envia o relatório de sucesso para o Gestor Web da Bredas.

---

## 4. O que Já Está Pronto e em Funcionamento Hoje (Estado Atual)

O projeto atingiu maturidade técnica elevada em ambos os repositórios, com recursos avançados de governança, segurança e usabilidade já implementados e testados.

### 1. Gestor de Atualizações (Painel Web) — Em Uso Operacional
* **Canais de Distribuição e Versões Piloto (`is_piloto`):** Suporte nativo a versões de teste para disponibilização controlada apenas para clientes do canal piloto antes da liberação geral.
* **Controle de Concorrência Otimista (OCC):** Controle de versão com revisões atômicas, impedindo que edições simultâneas entre técnicos sobrescrevam dados sem aviso.
* **Ficha 360° do Cliente (`ConsultaView`):** Painel unificado com histórico completo de atendimentos, cópia rápida de acessos remotos (AnyDesk/Suporte Bredas em 1 clique), linha do tempo de eventos e **Matriz Comparativa de Versões** (instalada vs publicada em tempo real).
* **Trilha de Auditoria Visual (`HistoricoView`):** Log completo de auditoria (quem criou, editou ou excluiu) com visualizador de diferenças (*diff* visual colorido antes/depois campo a campo).
* **Telemetria de Agentes ao Vivo (Live Pulse):** Monitoramento em tempo real do parque de clientes, exibindo barra de pulso dinâmico, clientes atualizados, agentes offline (>24h) e alertas de erro.
* **Gestão de Agendamentos em Lista e Quadro Kanban Interativo:** Visualização em colunas por status, identificação visual de tarefas atrasadas (`is-overdue`), avanço rápido de etapas e conversão direta de agendamento em atualização registrada.
* **Nova Experiência de Uso (UX/UI Moderna - Setembro/2026):**
  * Modais centralizados modernos e ergonômicos em 2 colunas para cadastros e edições rápidas.
  * Paleta de comandos universal (`Ctrl+K`) e navegação completa por atalhos de teclado (`j`/`k`, `Enter`/`e`, `Alt+N`).
  * Ações e marcações em lote com `Shift+Clique`.
  * Suporte a temas Claro, Escuro e Sistema com cache inteligente SWR.
* **Qualidade e Confiabilidade Comprovadas:** Suíte com **362 testes automatizados** 100% aprovados e verificação estrita de tipos TypeScript.

### 2. Agente Atualizador ERP (Serviço C# / .NET 8) — Pré-Piloto Homologado
* **Novo Assistente Gráfico de Configuração (`SetupForm`):** Interface gráfica nativa para configuração fácil e rápida no servidor do cliente (caminhos do Firebird `gfix`/`gbak`/`isql`, porta, bancos, token e URL da API), com botão para **Testar Conexão** antes de ativar o serviço.
* **Validação de Ambiente no Boot:** O agente valida se os utilitários do Firebird e o banco estão acessíveis antes de iniciar o loop de trabalho, prevenindo falhas silenciosas.
* **Auto-recuperação de Interrupções:** Caso o servidor reinicie ou falte luz no meio de uma atualização (`PROCESSANDO`), o agente detecta na inicialização e recupera o banco automaticamente para o estado seguro.
* **Motor Robusto de Scripts Firebird:** Tratamento automático de triggers e stored procedures (`SET TERM`), execução em 2 passadas para dependências cíclicas e validação na tabela `SCRIPTS`.
* **Pausa Remota:** Possibilidade de pausar remotamente a atuação do agente via painel web.
* **Homologado com Banco Real:** O ciclo completo foi testado repetidamente contra cópia real do banco Firebird com **366 tabelas e mais de 1.000 scripts SQL reais** do `B_Vendas`.
* **Testes Automatizados de Integração:** Projeto `AtualizadorERP.Tests` com cobertura dos fluxos do Worker e de rollback.

---

## 5. Riscos Mapeados e Como Cada Um Foi Blindado

A auditoria técnica levantou antecipadamente os riscos operacionais e implementou travas de engenharia para cada um:

| Risco Mapeado | O que poderia acontecer | Como o sistema foi blindado | Situação Atual |
|---|---|---|---|
| **Queda de energia ou reinício durante atualização** | Banco Firebird ficar bloqueado ou inacessível. | O agente detecta no boot interrupções não finalizadas e restaura o banco automaticamente a partir do backup inicial. | **Resolvido e Testado** |
| **Falha em script SQL do banco** | Cliente ficar com schema incompleto ou dados corrompidos. | O motor interrompe na hora, executa rollback, restaura o backup prévio e devolve o banco ao ar funcional. | **Resolvido e Testado** |
| **Arquivo corrompido no download** | Executável danificado ser gravado na pasta do cliente. | Validação estrita de hash SHA-256 antes da extração. Se 1 byte diferir, o pacote é descartado. | **Resolvido e Testado** |
| **Operador publicar versão errada para todos** | Pacote não testado ser enviado a toda a base de clientes. | Canal de Versões Piloto (`is_piloto`) com transação atômica e permissão restrita a Administradores. | **Resolvido e Testado** |
| **Conflito de edição simultânea no painel** | Um operador sobrescrever alterações de outro. | Controle de Concorrência Otimista (OCC) com verificação de revisão atômica. | **Resolvido e Testado** |
| **Scripts antigos serem reaplicados** | Erro de "tabela ou coluna já existente" no banco. | O agente consulta o histórico da tabela `SCRIPTS` e pula arquivos já executados. | **Mitigado (Requer triagem no piloto)** |
| **Atualização ocorrer durante venda no caixa** | Caixa travar na frente do consumidor. | O agente só inicia a execução após autorização explícita do usuário no ERP (Fase 2). | **Pendente de tela no Delphi** |
| **Processo externo travar o servidor do cliente** | `gfix` ou `gbak` ficarem travados indefinidamente. | Timeout obrigatório com encerramento forçado em qualquer chamada de processo externo. | **Resolvido e Testado** |

---

## 6. Ganhos do Negócio (Retorno sobre o Investimento)

A ativação da esteira automática traz retornos operacionais e financeiros diretos para a Bredas:

### 1. Eficiência Máxima da Equipe de Suporte
* Elimina horas de conexão remota repetitiva via AnyDesk.
* A equipe é liberada para atuar em suporte consultivo de qualidade, implantação de novos recursos e relacionamento com o cliente.

### 2. Agilidade de Distribuição em Massa
* Atualizações críticas (como notas técnicas urgentes da SEFAZ) que levavam dias ou semanas para cobrir toda a base agora podem ser aplicadas em minutos de forma coordenada.

### 3. Fim das Falhas Humanas e Padronização
* O mesmo procedimento auditado e seguro roda em 100% dos clientes, eliminando esquecimento de passos ou variações individuais.
* Alertas preventivos: a equipe é avisada sobre qualquer anomalia antes mesmo do cliente notar.

### 4. Escalabilidade Real da Empresa
* A carteira de clientes pode dobrar ou triplicar sem a necessidade de contratações na mesma proporção para sustentar atualizações.

---

## 7. O que Falta para o Piloto e Próximos Passos

O projeto está tecnicamente pronto para iniciar a operação supervisionada. Restam apenas etapas práticas de campo:

```
ETAPA 1                    ETAPA 2                   ETAPA 3                    ETAPA 4
Ajuste Delphi (Fase 2)     Triagem do Piloto         Piloto Supervisionado      Liberação Gradual
┌──────────────────┐       ┌──────────────────┐      ┌──────────────────┐       ┌──────────────────┐
│ Janela simples   │  ──►  │ Alinhar tabela   │  ──► │ Instalar agente  │  ──►  │ Liberar para     │
│ de confirmação   │       │ SCRIPTS do       │      │ no Cliente 01 e  │       │ grupos de 5, 10, │
│ no ERP existente │       │ cliente piloto   │      │ acompanhar ao vivo│      │ 20 clientes      │
└──────────────────┘       └──────────────────┘      └──────────────────┘       └──────────────────┘
```

### 1. Etapa 1: Janela de Confirmação no ERP Delphi (Fase 2)
* **O que é:** No código Delphi do ERP, adicionar uma checagem simples na abertura: se houver registro com status `PENDENTE` na tabela `SYS_ATUALIZACAO`, exibe a pergunta ao usuário:  
  *"Existe uma atualização disponível. Deseja aplicar agora? [Sim] [Lembrar mais tarde]"*.
* Ao clicar em Sim, o ERP grava `AUTORIZADO` e fecha o sistema para o agente assumir.

### 2. Etapa 2: Triagem de Scripts do Cliente Piloto 01
* Selecionar um cliente parceiro de baixo risco para ser o **Cliente Piloto 01**.
* Fazer a conferência rápida dos scripts que esse cliente já possui aplicados, garantindo que a tabela `SCRIPTS` reflita o estado inicial correto.

### 3. Etapa 3: Execução Supervisionada do Piloto
* Utilizar o novo assistente gráfico (`SetupForm`) para instalar e configurar o agente no servidor do Cliente Piloto 01 em menos de 5 minutos.
* Publicar uma versão no canal piloto e acompanhar o ciclo completo em tempo real pelo Painel Web e pelos alertas do Discord.

### 4. Etapa 4: Expansão Gradual da Base
* Validado o primeiro ciclo em produção real, iniciar a implantação em lotes controlados (5, 10, 20 clientes) até cobrir toda a base.

### 5. Repositórios e Governança do Projeto

Código-fonte estruturado em dois repositórios independentes com versionamento Git completo:

* **Gestor de Atualizações (Painel Web + API Central):**  
  `github.com/antoniossalomao/gestor_atualizacao`
* **Agente Atualizador ERP (Serviço Windows C# .NET 8):**  
  `github.com/antoniossalomao/atualizador_automatico`
