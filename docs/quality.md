# Qualidade e evidências

O projeto usa Vitest para domínio e integração HTTP, Playwright para navegador e GitHub Actions para executar as verificações em ambiente descartável.

## Cobertura implementada

- Autenticação, sessão protegida, login inválido, logout e autorização entre perfis.
- Criação, atualização, versão concorrente, atribuição, prioridade e transição de status.
- Problemas, associação de incidentes, investigação e resolução.
- Prazos 24x7 de resposta e resolução; automações e notificações deduplicadas.
- Payloads inválidos, CSRF, acesso administrativo e isolamento de registros de solicitantes.
- Jornada de incidente pela interface, persistência após recarregar, filtros e métricas.
- Navegação e ausência de overflow do documento em 320, 375, 390, 430, 768, 1024 e 1440 px.

## Execução

Após `npm install` e `npm run setup`:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:restart
npm run db:migrate
npx playwright install chromium
npm run test:e2e
```

Playwright prepara contextos novos, utiliza a senha aleatória do arquivo ignorado `.demo-credentials` e não precisa de segredo no workflow. O CI cria a demonstração em um checkout efêmero. Trace, imagem e vídeo de falhas podem conter registros demonstrativos de teste; não devem ser usados com dados reais sem política adequada.

`test:restart` requer o build da API e usa um arquivo SQLite temporário próprio. Ele inicia a API compilada em um processo, cria um chamado, comentário, histórico e sessão, encerra o processo e o inicia novamente. A verificação consulta esses registros e a sessão após o reinício; não altera o banco de demonstração.

## Registro de validação

Validação executada em **11 de outubro de 2026**, Windows, PowerShell, Node **24.15.0** e Chromium do Playwright:

| Verificação                                              | Resultado observado                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Vitest / integração Fastify                              | **34 testes aprovados**, 1 arquivo, 37,30 s                                            |
| Playwright contra frontend compilado em `localhost:3001` | **17 testes aprovados**, 1,3 min                                                       |
| Responsividade                                           | 320, 375, 390, 430, 768, 1024 e 1440 px aprovados                                      |
| `npm run typecheck`                                      | Aprovado nos três workspaces                                                           |
| `npm run lint`                                           | Aprovado                                                                               |
| `npm run format:check`                                   | Aprovado                                                                               |
| `npm run build`                                          | API e frontend compilados com sucesso                                                  |
| `npm audit --audit-level=moderate`                       | **0 vulnerabilidades** reportadas                                                      |
| `npm run test:restart`                                   | Chamado, comentário, histórico e sessão preservados após reiniciar o processo real     |
| Instalação em cópia limpa                                | `npm ci`, setup, migrations, build e persistência executados                           |
| Setup repetido                                           | `.env` preservado; seed mantém 5 usuários, 18 incidentes, 3 problemas e 7 solicitações |

A suíte de navegador inclui login inválido e logout, jornada completa de incidente, investigação e associação de problemas, conclusão de solicitações, edição administrativa com sessão preservada, leitura em lote de notificações, download CSV e isolamento de rascunhos ao navegar entre chamados. A suíte HTTP verifica também concorrência, snapshots de prioridade/SLA, revogação de sessão em mudança de papel, CSRF, força bruta, isolamento de solicitantes e automações com falha, repetição e recuperação.

Não restam falhas nas verificações locais acima. O build informa dois avisos de anotação de comentário da dependência Zod; Rollup remove essas anotações e conclui a compilação. Eles não representam falha de validação ou de execução.

Os resultados remotos podem ser conferidos nas [execuções do NexusOps CI](https://github.com/ludgerios/nexusops/actions/workflows/ci.yml), que usam instalação limpa e matriz Windows/Ubuntu. Este registro local não substitui o status remoto do commit avaliado.

## Limites

Os testes funcionais não substituem revisão completa de acessibilidade, teste manual em todos os dispositivos, pentest, teste de carga, teste de recuperação de desastre nem validação de implantação pública. A presença do workflow CI também não prova uma execução remota; consulte o status do commit no GitHub.
