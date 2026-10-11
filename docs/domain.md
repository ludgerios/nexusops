# Domínio e regras

## Tipos de registro

Incidente, problema e solicitação são tipos distintos de chamado no domínio e na interface. Cada registro possui número automático único, autor, responsável opcional, equipe, campos de operação e histórico. Problemas acrescentam causa raiz, solução de contorno e resolução definitiva. A relação entre problemas e incidentes é persistida.

## Prioridade

Impacto e urgência utilizam `low`, `medium` e `high` (baixo, médio e alto). A prioridade é calculada no backend a partir da matriz configurável pelo administrador. A matriz inicial possui impacto nas linhas e urgência nas colunas:

| Impacto / urgência | Baixa | Média | Alta |
| ------------------ | ----- | ----- | ---- |
| Baixo              | P4    | P3    | P2   |
| Médio              | P3    | P2    | P2   |
| Alto               | P2    | P2    | P1   |

As metas de prioridade e SLA são exemplos fictícios de operação. Não constituem um padrão oficial de ITIL nem uma política de empresa.

## SLA 24x7

As contagens começam na criação do chamado e utilizam instantes em UTC. A interface apresenta as datas no fuso definido por `VITE_TIMEZONE`, cujo padrão é `America/Sao_Paulo`. A espera continua consumindo o prazo; a primeira versão não possui pausas nem calendário comercial.

A primeira resposta termina na primeira atribuição, entrada em atendimento, resolução ou comentário de um agente, incluindo nota interna. A resolução termina ao resolver ou cancelar o chamado. Resolver exige a descrição da solução; problemas também exigem causa raiz.

| Estado atual | Próximos estados permitidos        |
| ------------ | ---------------------------------- |
| Novo         | Em andamento, Cancelado            |
| Em andamento | Aguardando, Resolvido, Cancelado   |
| Aguardando   | Em andamento, Resolvido, Cancelado |
| Resolvido    | Fechado, Em andamento              |
| Fechado      | Nenhum                             |
| Cancelado    | Nenhum                             |

Fechados e cancelados não aceitam alterações ou comentários. Resolver e depois reabrir remove a data de resolução, mantém o prazo original e reativa a contagem de resolução; a primeira resposta registrada permanece. Solicitantes podem editar campos descritivos e impacto/urgência dos próprios chamados apenas enquanto estiverem novos. Eles não alteram responsável ou status.

| Prioridade    | Primeira resposta | Resolução |
| ------------- | ----------------: | --------: |
| P1 — Crítica  |        15 minutos |   4 horas |
| P2 — Alta     |        30 minutos |   8 horas |
| P3 — Moderada |           2 horas |  24 horas |
| P4 — Baixa    |           4 horas |  72 horas |

As metas aplicadas são copiadas para o registro de SLA quando o chamado é criado. A política alterada pelo administrador se aplica a novos chamados; o prazo existente é recalculado a partir da data original de criação quando a prioridade do chamado muda. Isso pode transformar um prazo em vencido imediatamente, pois a contagem não reinicia.

O estado do SLA é calculado a partir dos prazos e conclusões persistidos: dentro do prazo, próximo do vencimento, vencido, concluído no prazo ou concluído fora do prazo. O verificador de backend continua funcionando sem depender de uma aba de navegador aberta; ele depende de o processo da API estar ativo.

## Indicadores e período

O dashboard filtra registros pela data de abertura, nos últimos 7, 30 ou 90 dias UTC. O gráfico diário utiliza esse conjunto de incidentes e suas datas de abertura/resolução. Incidentes abertos e críticos excluem resolvidos, fechados e cancelados. O indicador de SLAs vencidos conta chamados ativos que venceram a meta de primeira resposta ou de resolução, uma vez por chamado.

O percentual de cumprimento usa a meta de resolução dos chamados concluídos no conjunto do período, incluindo incidentes, problemas e solicitações. Cancelados ficam fora desse percentual. Se nenhuma meta de resolução foi concluída, o valor é zero. A tela de SLAs apresenta separadamente os estados de primeira resposta e resolução.

## Permissões

| Ação                               | Administrator | Support Agent | Requester          |
| ---------------------------------- | ------------- | ------------- | ------------------ |
| Abrir incidente ou solicitação     | Sim           | Sim           | Sim                |
| Consultar chamados                 | Sim           | Operação      | Apenas os próprios |
| Atribuir e alterar atendimento     | Sim           | Sim           | Não                |
| Registrar comentário público       | Sim           | Sim           | Nos próprios       |
| Consultar ou escrever nota interna | Sim           | Sim           | Não                |
| Gerenciar problemas                | Sim           | Sim           | Não                |
| Gerenciar usuários e políticas     | Sim           | Não           | Não                |

Ocultar controles na interface melhora a experiência, mas a decisão de autorização sempre pertence à API. Recursos que o solicitante não pode consultar também ficam fora dos resultados e agregações permitidos para ele.

Um incidente pode estar ligado a um problema; um problema pode reunir vários incidentes. A associação exige tipos corretos e unicidade no banco. O solicitante não recebe os detalhes do problema relacionado nem o histórico interno da associação.
