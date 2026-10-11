# Segurança

## Controles implementados

- Senhas armazenadas com `scrypt` (`N=131072`, `r=8`, `p=1`), salt aleatório de 16 bytes e comparação resistente a diferenças de tempo.
- Sessões persistidas, com identificador aleatório no cookie `HttpOnly`, `SameSite` e expiração.
- Token CSRF vinculado à sessão para operações que alteram dados.
- Validação de entradas com Zod e consultas SQL parametrizadas.
- Content Security Policy com fontes e recursos servidos pela própria aplicação no build local, proteção contra enquadramento e cabeçalhos contra inferência de tipo.
- Limites de tentativas de autenticação e erros de login sem distinguir conta inexistente de senha incorreta.
- Papéis verificados no servidor; solicitantes têm consultas limitadas aos seus registros e não recebem notas internas.
- Controle de versão em atualizações de chamado e registro de eventos de auditoria sem senhas ou tokens.
- Seed restrito à demonstração local, com senha aleatória gravada em `.demo-credentials`, ignorado pelo Git.

A sessão expira em 12 horas no padrão configurável. O login limita a origem IP a 60 requisições em 15 minutos e bloqueia uma conta após 10 tentativas inválidas em 15 minutos; o contador de conta fica no banco e não desaparece após reiniciar. O limite de IP pertence ao processo da API. A comparação com um hash fictício evita um atalho de custo para contas inexistentes.

## Arquivos locais sensíveis

`.env`, `.demo-credentials`, arquivos SQLite e seus arquivos auxiliares não devem ser publicados. O seed gera contas fictícias e não oferece integração com recursos empresariais. Uma captura de tela de documentação nunca deve expor a senha demonstrativa.

Evite reutilizar senhas pessoais e restrinja permissões de leitura do diretório local se o computador for compartilhado. O arquivo `.demo-credentials` permite login nas contas locais; preserve-o apenas enquanto essas contas forem úteis.

## Antes de uma implantação pública

O padrão é execução em localhost. Uma implantação para usuários reais exige HTTPS com cookie `Secure`, configuração explícita de origem, substituição das contas de demonstração, backups e restauração, gestão de usuários e segredos, retenção de auditoria, observabilidade e testes de carga. O código público não equivale a uma implantação pública da aplicação.

Não estão implementados nesta versão: MFA, recuperação de senha por e-mail, SSO, antivírus de anexos, segregação de múltiplas organizações nem gestão de chaves em um cofre externo. São itens de roadmap, não controles disponíveis.
