import { buildApp } from './app.js';
import { configuration } from './config.js';
import { projectRoot } from './config.js';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
const staticRoot = resolve(projectRoot, 'apps/web/dist');
const hasBuiltWeb = existsSync(resolve(staticRoot, 'index.html'));
const origins =
  hasBuiltWeb && !configuration.production
    ? [
        ...new Set([
          ...configuration.origins,
          `http://localhost:${configuration.port}`,
          `http://${configuration.host}:${configuration.port}`,
        ]),
      ]
    : configuration.origins;
const { app } = await buildApp({
  ...configuration,
  origins,
  dbPath: configuration.databasePath,
  logger: true,
  staticRoot: hasBuiltWeb ? staticRoot : undefined,
});
const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
try {
  await app.listen({ host: configuration.host, port: configuration.port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
