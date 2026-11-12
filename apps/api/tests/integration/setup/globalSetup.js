import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import { runner } from 'node-pg-migrate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let pgContainer;
let redisContainer;

export async function setup({ provide }) {
  [pgContainer, redisContainer] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine').start(),
    new RedisContainer('redis:7-alpine').start(),
  ]);

  const databaseUrl = pgContainer.getConnectionUri();
  await runner({
    databaseUrl,
    dir: path.resolve(__dirname, '../../../migrations'),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  });

  provide('databaseUrl', databaseUrl);
  provide('redisUrl', redisContainer.getConnectionUrl());
}

export async function teardown() {
  await Promise.all([pgContainer?.stop(), redisContainer?.stop()]);
}
