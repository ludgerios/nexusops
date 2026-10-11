import { Store } from './db.js';
import { seedDemo } from './seed.js';
import { configuration, projectRoot } from './config.js';
const command = process.argv[2] ?? 'migrate';
if (!['migrate', 'seed', 'setup'].includes(command))
  throw new Error('Comando esperado: migrate, seed ou setup.');
const store = new Store(configuration.databasePath);
try {
  if (command === 'migrate') console.log('Migrations verificadas com sucesso.');
  else {
    if (configuration.production || !configuration.demoMode)
      throw new Error('Seed requer DEMO_MODE=true e NODE_ENV diferente de production.');
    const result = await seedDemo(store, {
      root: projectRoot,
      reset: process.argv.includes('--reset'),
    });
    console.log(
      result.created
        ? 'Base demonstrativa criada com sucesso.'
        : 'Base existente preservada; seed não duplicou os dados.',
    );
    console.log(
      result.credentialsAvailable
        ? `Credenciais locais: ${result.credentialsFile}`
        : 'Arquivo de credenciais ausente. Para restaurar a demonstração, execute npm run seed -- --reset.',
    );
  }
} finally {
  store.close();
}
