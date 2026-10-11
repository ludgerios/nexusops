import { randomUUID } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { User, Ticket, Level } from '@nexusops/shared';
import { Store } from './db.js';
import { TicketService } from './domain.js';
import { hashPassword, randomToken } from './security.js';

interface SeedOptions {
  root: string;
  reset?: boolean;
  now?: Date;
  password?: string;
}
export async function seedDemo(store: Store, options: SeedOptions) {
  const credentialsFile = join(options.root, '.demo-credentials');
  if (process.env.NODE_ENV === 'production')
    throw new Error('Dados de demonstração são proibidos em produção.');
  const existing = store.get<{ n: number }>('SELECT COUNT(*) n FROM users')!.n;
  if (existing && !options.reset)
    return { created: false, credentialsFile, credentialsAvailable: existsSync(credentialsFile) };
  if (
    existing &&
    options.reset &&
    !store.get("SELECT value FROM settings WHERE key='demoSeed' AND value='true'")
  )
    throw new Error('Reset permitido somente para uma base demonstrativa identificada pelo seed.');
  if (options.reset)
    store.transaction(() => {
      for (const table of [
        'notifications',
        'automation_executions',
        'audit_logs',
        'ticket_history',
        'ticket_comments',
        'problem_incidents',
        'sla_records',
        'tickets',
        'sessions',
        'login_attempts',
        'users',
        'teams',
      ])
        store.run(`DELETE FROM ${table}`);
      store.run('UPDATE counters SET value=1000');
      store.run("UPDATE settings SET value='[[4,3,2],[3,2,2],[2,2,1]]' WHERE key='priorityMatrix'");
      store.run(
        'UPDATE sla_policies SET responseMinutes=CASE priority WHEN 1 THEN 15 WHEN 2 THEN 30 WHEN 3 THEN 120 ELSE 240 END,resolutionMinutes=CASE priority WHEN 1 THEN 240 WHEN 2 THEN 480 WHEN 3 THEN 1440 ELSE 4320 END',
      );
      store.run('UPDATE automation_rules SET enabled=1,thresholdPercent=80');
    });
  const password = options.password ?? `Nxo!${randomToken().slice(0, 20)}`;
  const passwordHash = await hashPassword(password),
    now = options.now ?? new Date();
  const teams = [
    {
      id: randomUUID(),
      name: 'Service Desk',
      description: 'Atendimento inicial e experiência do colaborador.',
    },
    {
      id: randomUUID(),
      name: 'Plataformas e redes',
      description: 'Infraestrutura, conectividade e disponibilidade.',
    },
    {
      id: randomUUID(),
      name: 'Aplicações',
      description: 'Sistemas internos e automação de processos.',
    },
  ];
  const users: User[] = [
    {
      id: randomUUID(),
      name: 'Ana Martins',
      email: 'admin@nexusops.local',
      role: 'administrator',
      active: true,
      teamId: teams[0].id,
    },
    {
      id: randomUUID(),
      name: 'Lucas Almeida',
      email: 'agente@nexusops.local',
      role: 'agent',
      active: true,
      teamId: teams[1].id,
    },
    {
      id: randomUUID(),
      name: 'Mariana Costa',
      email: 'solicitante@nexusops.local',
      role: 'requester',
      active: true,
      teamId: null,
    },
    {
      id: randomUUID(),
      name: 'Beatriz Silva',
      email: 'beatriz@nexusops.local',
      role: 'agent',
      active: true,
      teamId: teams[2].id,
    },
    {
      id: randomUUID(),
      name: 'Rafael Torres',
      email: 'rafael@nexusops.local',
      role: 'requester',
      active: true,
      teamId: null,
    },
  ];
  let current = now;
  const service = new TicketService(store, () => current);
  store.transaction(() => {
    for (const team of teams)
      store.run(
        'INSERT INTO teams VALUES (?,?,?,?)',
        team.id,
        team.name,
        team.description,
        now.toISOString(),
      );
    for (const user of users)
      store.run(
        'INSERT INTO users VALUES (?,?,?,?,?,?,?,?)',
        user.id,
        user.name,
        user.email,
        passwordHash,
        user.role,
        1,
        user.teamId,
        now.toISOString(),
      );
    store.run(
      "INSERT INTO settings VALUES ('demoSeed','true') ON CONFLICT(key) DO UPDATE SET value='true'",
    );
  });
  const incidentTitles = [
    ['Portal de atendimento indisponível', 'Aplicações', 'high', 'high'],
    ['Instabilidade no enlace de internet', 'Redes', 'high', 'medium'],
    ['Falha na autenticação do VPN', 'Acesso e identidade', 'medium', 'medium'],
    ['Impressora do setor sem conexão', 'Equipamentos', 'low', 'low'],
    ['Lentidão na plataforma de relatórios', 'Aplicações', 'medium', 'high'],
    ['Erro ao sincronizar pasta compartilhada', 'Infraestrutura', 'low', 'medium'],
    ['Serviço de identidade com falhas intermitentes', 'Acesso e identidade', 'high', 'high'],
    ['Aplicação de inventário retorna erro', 'Aplicações', 'medium', 'medium'],
    ['Notebook reinicia durante videoconferência', 'Equipamentos', 'low', 'high'],
    ['Falha de acesso ao ambiente de homologação', 'Acesso e identidade', 'low', 'low'],
    ['Alertas de armazenamento na plataforma de arquivos', 'Infraestrutura', 'high', 'medium'],
    ['Conexão sem fio instável no laboratório', 'Redes', 'medium', 'low'],
    ['Falha no processo de exportação de dados', 'Aplicações', 'medium', 'medium'],
    ['Mouse e teclado com desconexões frequentes', 'Equipamentos', 'low', 'low'],
    ['Bloqueio de conta após atualização', 'Acesso e identidade', 'low', 'medium'],
    ['Servidor de arquivos sem resposta', 'Infraestrutura', 'high', 'high'],
    ['Notificações duplicadas na aplicação', 'Aplicações', 'low', 'low'],
    ['Canal de testes com alta latência', 'Redes', 'medium', 'high'],
  ] as const;
  const incidents: Ticket[] = [];
  for (const [index, row] of incidentTitles.entries()) {
    const age =
      index === 0
        ? 0.14
        : index === 1
          ? 1.5
          : index === 2
            ? 0.08
            : (index % 6) + Math.floor(index / 4) * 3;
    const opened = new Date(now.getTime() - age * 86400000);
    current = opened;
    let ticket = service.create(index % 2 ? users[4] : users[2], {
      kind: 'incident',
      title: row[0],
      description: `Registro demonstrativo: ${row[0].toLowerCase()}. A equipe foi acionada para analisar o impacto, identificar a origem e restabelecer o serviço. Todos os dados deste ambiente são fictícios.`,
      category: row[1],
      impact: row[2] as Level,
      urgency: row[3] as Level,
      teamId: teams[index % 3].id,
    });
    if (index % 4 !== 0) {
      current = new Date(opened.getTime() + (index % 3 === 0 ? 180 : 8) * 60000);
      ticket = service.update(users[1], ticket.id, {
        version: ticket.version,
        status: 'in_progress',
        assigneeId: index % 2 ? users[1].id : users[3].id,
      });
      service.comment(
        users[1],
        ticket.id,
        'Diagnóstico inicial concluído. Estamos verificando os registros e aplicando as correções necessárias.',
        false,
      );
      ticket = service.get(ticket.id);
      if (index >= 4 && index % 3 !== 2) {
        current = new Date(opened.getTime() + (index % 5 === 0 ? 50 * 60 : 90) * 60000);
        ticket = service.update(users[1], ticket.id, {
          version: ticket.version,
          status: 'resolved',
          resolution:
            'Configuração revisada e serviço validado com o solicitante. Monitoramento confirmou a estabilidade.',
        });
        if (index % 2 === 0) {
          current = new Date(current.getTime() + 3600000);
          ticket = service.update(users[1], ticket.id, {
            version: ticket.version,
            status: 'closed',
          });
        }
      } else if (index % 3 === 2) {
        current = new Date(opened.getTime() + 90 * 60000);
        ticket = service.update(users[1], ticket.id, {
          version: ticket.version,
          status: 'waiting',
        });
      }
    }
    incidents.push(ticket);
  }
  const problems: Ticket[] = [];
  for (const [index, title] of [
    'Autenticação intermitente no serviço de identidade',
    'Latência recorrente no enlace principal',
    'Falha de sincronização em arquivos compartilhados',
  ].entries()) {
    const opened = new Date(now.getTime() - (index + 2) * 86400000);
    current = opened;
    let ticket = service.create(users[1], {
      kind: 'problem',
      title,
      description:
        'Investigação de recorrência observada em incidentes demonstrativos. Objetivo: documentar a causa, reduzir reincidências e validar uma correção definitiva.',
      category: index === 1 ? 'Redes' : 'Infraestrutura',
      impact: 'high',
      urgency: index === 0 ? 'high' : 'medium',
      teamId: teams[1].id,
    });
    current = new Date(opened.getTime() + 15 * 60000);
    ticket = service.update(users[1], ticket.id, {
      version: ticket.version,
      status: 'in_progress',
      assigneeId: users[1].id,
      rootCause:
        index === 2
          ? 'Limite de conexões atingido durante o processamento concorrente.'
          : 'Hipótese em investigação: configuração inconsistente após atualização.',
      workaround: 'Reiniciar a conexão e usar o canal secundário até a validação da correção.',
    });
    service.comment(
      users[1],
      ticket.id,
      'Investigação técnica registrada. Validar a hipótese com dados do ambiente de testes.',
      true,
    );
    ticket = service.get(ticket.id);
    if (index === 2) {
      current = new Date(opened.getTime() + 180 * 60000);
      ticket = service.update(users[1], ticket.id, {
        version: ticket.version,
        status: 'resolved',
        rootCause: 'Limite de conexões do processo de sincronização estava abaixo da demanda.',
        resolution:
          'Pool de conexões ajustado e limite revisado. Correção validada em testes de carga.',
      });
    }
    problems.push(ticket);
  }
  current = now;
  service.relate(users[1], problems[0].id, incidents[2].id);
  service.relate(users[1], problems[0].id, incidents[6].id);
  service.relate(users[1], problems[1].id, incidents[1].id);
  service.relate(users[1], problems[1].id, incidents[17].id);
  service.relate(users[1], problems[2].id, incidents[5].id);
  const requests = [
    ['Instalação de editor de código', 'Instalação de software'],
    ['Acesso ao ambiente de análise', 'Solicitação de acesso'],
    ['Configuração de notebook de trabalho', 'Configuração de equipamento'],
    ['Criação de espaço de testes', 'Solicitação de recurso de TI'],
    ['Atualização de aplicativo de desenho', 'Instalação de software'],
    ['Suporte à plataforma de relatórios', 'Suporte a aplicação'],
    ['Permissão para pasta do projeto', 'Solicitação de acesso'],
  ];
  for (const [index, [title, requestType]] of requests.entries()) {
    const opened = new Date(now.getTime() - (index + 1) * 0.6 * 86400000);
    current = opened;
    let ticket = service.create(index % 2 ? users[4] : users[2], {
      kind: 'request',
      title,
      description:
        'Solicitação demonstrativa para apoiar uma atividade de trabalho. Requisitos registrados, sem dados empresariais reais ou integrações externas.',
      category: index % 2 ? 'Acesso e identidade' : 'Software',
      requestType,
      impact: 'low',
      urgency: index % 3 ? 'low' : 'medium',
      teamId: teams[0].id,
    });
    if (index > 0) {
      current = new Date(opened.getTime() + 60 * 60000);
      ticket = service.update(users[3], ticket.id, {
        version: ticket.version,
        status: 'in_progress',
        assigneeId: users[3].id,
      });
    }
    if (index > 3) {
      current = new Date(opened.getTime() + 180 * 60000);
      service.update(users[3], ticket.id, {
        version: ticket.version,
        status: 'resolved',
        resolution:
          'Solicitação atendida e validada com o usuário. Orientações de uso registradas.',
      });
    }
  }
  current = now;
  service.tick();
  service.audit(users[0].id, 'demo.seeded', 'database', 'local', {
    users: users.length,
    incidents: incidents.length,
    problems: problems.length,
    requests: requests.length,
  });
  writeFileSync(
    credentialsFile,
    JSON.stringify(
      {
        password,
        users: users.map(({ id, email, name, role }) => ({ id, email, name, role })),
        createdAt: now.toISOString(),
      },
      null,
      2,
    ),
    { encoding: 'utf8', mode: 0o600 },
  );
  return { created: true, credentialsFile, credentialsAvailable: true };
}
