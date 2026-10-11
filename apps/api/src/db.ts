import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      'PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;',
    );
    this.migrate();
  }
  run(sql: string, ...values: SQLInputValue[]) {
    return this.db.prepare(sql).run(...values);
  }
  get<T>(sql: string, ...values: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...values) as T | undefined;
  }
  all<T>(sql: string, ...values: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...values) as T[];
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  migrate() {
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, appliedAt TEXT NOT NULL)',
    );
    const folder = new URL('../migrations/', import.meta.url);
    for (const name of readdirSync(folder)
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      if (this.get('SELECT name FROM schema_migrations WHERE name=?', name)) continue;
      this.transaction(() => {
        this.db.exec(readFileSync(new URL(name, folder), 'utf8'));
        this.run('INSERT INTO schema_migrations VALUES (?,?)', name, new Date().toISOString());
      });
    }
  }
  close() {
    this.db.close();
  }
}
