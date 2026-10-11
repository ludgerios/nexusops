# API REST

Base local: `http://localhost:3001`. Todas as rotas `/api/*`, exceto login, exigem uma sessão válida. O frontend de desenvolvimento usa o proxy `/api` do Vite, mantendo cookies na mesma origem da interface.

## Autenticação e erros

`POST /api/auth/login` recebe `{ "email": "...", "password": "..." }`, cria o cookie `nexusops_session` e retorna `{ user, csrfToken }`. `GET /api/auth/me` retorna o mesmo contrato para a sessão atual. `POST /api/auth/logout` revoga a sessão no banco e limpa o cookie.

Mutações autenticadas (`POST`, `PATCH`, `PUT`, `DELETE`) exigem o cabeçalho `X-CSRF-Token` com o token da sessão. Uma origem presente também deve estar na lista permitida. Não coloque o token ou a senha em URLs.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Verifique os campos informados.",
    "fields": [{ "path": "title", "message": "..." }]
  }
}
```

Os códigos HTTP principais são 400 (validação ou operação inválida), 401 (sessão ausente/credenciais inválidas), 403 (permissão/CSRF), 404 (registro inexistente ou inacessível), 409 (conflito/versão), 429 (limitação de tentativas) e 500 (erro interno sem dados de implementação). O backend oculta a existência de chamados de outros solicitantes com 404.

## Rotas

| Método | Rota                                     | Ação / retorno                                                  |
| ------ | ---------------------------------------- | --------------------------------------------------------------- |
| GET    | `/health`                                | Diagnóstico público, banco e versão                             |
| POST   | `/api/auth/login`                        | Autenticar e criar sessão                                       |
| GET    | `/api/auth/me`                           | Usuário atual e CSRF                                            |
| POST   | `/api/auth/logout`                       | Encerrar sessão                                                 |
| GET    | `/api/meta`                              | Usuários públicos permitidos, equipes, categorias e matriz      |
| GET    | `/api/tickets`                           | Lista filtrada e paginada                                       |
| POST   | `/api/tickets`                           | Criar chamado, 201                                              |
| GET    | `/api/tickets/:id`                       | Detalhe, comentários, histórico e relações                      |
| PATCH  | `/api/tickets/:id`                       | Atualizar campos permitidos com versão                          |
| POST   | `/api/tickets/:id/comments`              | Comentário público ou nota interna, 201                         |
| POST   | `/api/tickets/:id/relations`             | Associar incidente a um problema                                |
| DELETE | `/api/tickets/:id/relations/:incidentId` | Remover associação                                              |
| GET    | `/api/dashboard?days=30`                 | Indicadores, distribuições, evolução e recentes                 |
| GET    | `/api/slas`                              | Políticas e registros, para equipe de suporte                   |
| PATCH  | `/api/slas/:priority`                    | Alterar política, administrador                                 |
| GET    | `/api/automations`                       | Regras e últimas 100 execuções, para equipe                     |
| PATCH  | `/api/automations/:id`                   | Configurar regra predefinida, administrador                     |
| GET    | `/api/notifications`                     | Até 100 notificações do usuário e total não lido                |
| POST   | `/api/notifications/read-all`            | Marcar todas as notificações próprias, inclusive além da página |
| PATCH  | `/api/notifications/:id`                 | Marcar uma notificação própria como lida                        |
| GET    | `/api/admin`                             | Usuários, equipes, matriz e últimos 100 eventos de auditoria    |
| POST   | `/api/admin/users`                       | Criar usuário, administrador, 201                               |
| PATCH  | `/api/admin/users/:id`                   | Atualizar usuário, administrador                                |
| POST   | `/api/admin/teams`                       | Criar equipe, administrador, 201                                |
| PATCH  | `/api/admin/teams/:id`                   | Atualizar equipe, administrador                                 |
| PUT    | `/api/admin/priority-matrix`             | Substituir matriz 3×3, administrador                            |

## Chamados

`GET /api/tickets` aceita `kind`, `status`, `priority`, `category`, `teamId`, `assigneeId`, `search`, `days`, `page` e `limit`. `limit` vai de 1 a 100; `page` começa em 1. `days` filtra as criações nos últimos 7, 30 ou 90 dias. A consulta sempre aplica as permissões do usuário antes de calcular o total. O cliente deve omitir filtros vazios.

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

Payload mínimo de criação:

```json
{
  "kind": "incident",
  "title": "VPN indisponível para a equipe de suporte",
  "description": "A conexão falha ao autenticar no gateway demonstrativo.",
  "category": "Redes",
  "impact": "high",
  "urgency": "high"
}
```

Tipos: `incident`, `problem` e `request`. Solicitações exigem `requestType`. Título possui de 5 a 160 caracteres; descrição de 10 a 20.000; categoria de 2 a 80. Impacto e urgência são `low`, `medium` ou `high`. Número, prioridade, timestamps e versão são definidos pelo servidor. Causa raiz (`rootCause`) e solução de contorno (`workaround`) pertencem a problemas.

O detalhe retorna `{ ticket, comments, history, relatedIncidents, relatedProblem }`. Os campos internos são filtrados pelo servidor para solicitantes.

Atualização de atendimento:

```json
{
  "version": 1,
  "status": "in_progress",
  "assigneeId": "UUID-do-agente"
}
```

`version` é obrigatória. Se outro atendimento atualizou o registro, a API responde 409; busque o detalhe novamente e reconcilie antes de reenviar. `resolved` exige `resolution`; problemas também precisam de `rootCause`. As [transições de domínio](domain.md) são verificadas no servidor.

Comentário: `{ "body": "Atualização de atendimento.", "internal": false }`. Um solicitante não pode utilizar `internal: true`. Associação: envie `{ "incidentId": "UUID-do-incidente" }` na rota do problema.

## SLAs, regras e administração

Política de SLA: `{ "responseMinutes": 15, "resolutionMinutes": 240 }`. Valores são inteiros positivos de até 525.600 minutos; resolução deve ser maior ou igual à primeira resposta. A mudança não substitui os prazos já copiados para os chamados.

Regras disponíveis: `critical`, `sla-near`, `sla-breach` e `assignment`. A configuração recebe `enabled` e, apenas para `sla-near`, `thresholdPercent` de 1 a 99. Não é permitido fornecer código executável ou regras arbitrárias.

Uma notificação individual aceita apenas `{ "read": true }`. A rota `/api/notifications/read-all` recebe `{}` e atualiza todas as notificações próprias não lidas, incluindo registros além dos últimos 100 mostrados. Uma notificação de outro usuário não pode ser marcada pelo usuário atual.

Usuários novos exigem nome, e-mail, senha de ao menos 12 caracteres, papel e equipe opcional. Os papéis são `administrator`, `agent` e `requester`. Desativar conta ou mudar papel revoga suas sessões. A API impede a remoção do último administrador ativo e exige reatribuir chamados ativos antes de transformar um agente em solicitante.

Matriz de prioridade: `{ "matrix": [[4,3,2],[3,2,2],[2,2,1]] }`. Linhas correspondem a impacto baixo/médio/alto; colunas a urgência baixa/média/alta. Cada valor deve estar entre 1 e 4.
