# Operação local no Windows

## Preparação

Instale Node.js 24 LTS (24.15.0 ou superior dentro da linha 24), npm e Git. Use os instaladores oficiais de [Node.js](https://nodejs.org/en/download) e [Git](https://git-scm.com/downloads/win). Abra um novo PowerShell para recarregar o PATH.

```powershell
node --version
npm --version
git --version
git clone https://github.com/ludgerios/nexusops.git
Set-Location nexusops
npm install
npm run setup
Get-Content -LiteralPath .demo-credentials
npm run dev
```

O login está em `http://localhost:5173`. O diagnóstico da API está em `http://localhost:3001/health`. Abra o endereço da interface em um navegador moderno e use uma conta listada no arquivo local de credenciais.

Caso uma política de execução bloqueie `npm.ps1`, use `npm.cmd` nos mesmos comandos. Não é necessário alterar a política global do PowerShell.

## Configuração

`setup` copia `.env.example` para `.env` apenas se não houver um arquivo existente. O caminho do banco padrão é `./data/nexusops.db`, relativo à raiz do projeto.

| Variável            | Padrão                  | Uso                                    |
| ------------------- | ----------------------- | -------------------------------------- |
| `NODE_ENV`          | `development`           | Ambiente de execução                   |
| `HOST`              | `127.0.0.1`             | Interface local da API                 |
| `PORT`              | `3001`                  | Porta da API                           |
| `WEB_ORIGIN`        | `http://localhost:5173` | Origem permitida do frontend           |
| `VITE_TIMEZONE`     | `America/Sao_Paulo`     | Fuso usado nas datas da interface      |
| `DATABASE_PATH`     | `./data/nexusops.db`    | Arquivo SQLite                         |
| `SESSION_TTL_HOURS` | `12`                    | Validade da sessão                     |
| `SLA_INTERVAL_MS`   | `30000`                 | Intervalo de verificação de SLAs       |
| `DEMO_MODE`         | `true`                  | Permite preparar dados de demonstração |

Depois de editar `.env`, pare e reinicie a API. O proxy de desenvolvimento aponta para a API local na configuração do Vite; mudar portas exige manter frontend, backend e origem consistentes.

## Interromper, reiniciar e persistir

Use Ctrl+C no terminal que executa `npm run dev`. Reinicie com o mesmo comando. Os chamados, sessões, notificações e histórico permanecem no SQLite. O banco não deve ser apagado para reiniciar o servidor.

O processo de desenvolvimento precisa de um terminal ativo. O projeto não configura inicialização automática no Windows nem um serviço que continue depois que a sessão do terminal termina.

Depois de `npm run build`, `npm start` inicia a API compilada e serve a interface na mesma porta: `http://localhost:3001`. Pare o modo de desenvolvimento antes de iniciar esse processo para liberar a porta. No padrão demonstrativo local, a configuração admite essa origem; um ambiente produtivo deve definir a origem HTTPS explicitamente.

## Restaurar demonstração

Pare os servidores antes da restauração:

```powershell
npm run demo:reset -- --confirm
Get-Content -LiteralPath .demo-credentials
npm run dev
```

O banco e seus arquivos auxiliares são movidos para backups datados; as credenciais anteriores também ficam em backup. Uma senha nova é criada. Essa restauração automática fica restrita ao diretório `data/` e à demonstração. Os backups são locais e não devem entrar no Git.

Para fazer uma cópia manual, pare a API e copie o diretório `data/` para uma pasta protegida. Para restaurar um backup manualmente, mantenha os processos parados e preserve uma cópia do banco atual antes de substituir os arquivos. Uma cópia do arquivo principal enquanto existe WAL ativo pode omitir transações ainda no WAL.

## Qualidade

```powershell
npm run typecheck
npm run lint
npm run format:check
npm audit --audit-level=moderate
npm test
npm run build
npm run test:restart
npm run db:migrate
npx playwright install chromium
npm run test:e2e
```

Vitest usa bancos de teste isolados. Os E2E usam o banco configurado do ambiente local e criam registros próprios. As capturas comuns ficam em `test-results/screenshots/`; os diagnósticos de falha em `test-results/` e, no CI, `playwright-report/`.

Para atualizar as imagens publicadas em `docs/screenshots/`, use uma demonstração limpa, inicie a aplicação e execute:

```powershell
$env:E2E_UPDATE_SCREENSHOTS = '1'
npx playwright test e2e/screenshots.spec.ts
Remove-Item Env:E2E_UPDATE_SCREENSHOTS
```

Para executar os testes contra a interface compilada de um servidor já ativo, defina `$env:E2E_BASE_URL = 'http://localhost:3001'`, execute `npm run test:e2e` e remova a variável com `Remove-Item Env:E2E_BASE_URL`. O endereço externo desativa o início automático do servidor de desenvolvimento pelo Playwright.

## Diagnóstico

- `node:sqlite` indisponível: verifique se está utilizando a linha Node 24 exigida pelo projeto.
- Porta ocupada: encerre o processo que usa 5173 ou 3001 antes de iniciar; o projeto não deve migrar silenciosamente para uma porta diferente.
- Login recusado: consulte as credenciais atuais; depois de `demo:reset`, a senha anterior deixa de valer.
- Migrations ou dados inválidos: preserve o banco antes de investigar; `demo:reset` é uma restauração de demonstração, não um reparo de produção.
- Chromium ausente: execute `npx playwright install chromium` antes dos testes de navegador.
- `.env` já existe: `setup` mantém o arquivo; confira suas variáveis quando os defaults documentados não corresponderem ao ambiente.
