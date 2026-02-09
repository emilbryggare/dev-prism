import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  createDbSession,
  deleteDbSession,
  getDbSession,
  listDbSessions,
  allocatePorts,
  getPortAllocations,
  getAllocatedPorts,
  reservePort,
  unreservePort,
  getReservedPorts,
} from './db.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  branch     TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS port_allocations (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  service    TEXT NOT NULL,
  port       INTEGER NOT NULL UNIQUE,
  PRIMARY KEY (session_id, service)
);

CREATE TABLE IF NOT EXISTS reservations (
  port       INTEGER PRIMARY KEY,
  reason     TEXT,
  created_at TEXT NOT NULL
);
`;

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

describe('db', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  describe('schema', () => {
    it('is idempotent', () => {
      db.exec(SCHEMA);
      db.exec(SCHEMA);
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        .all() as { name: string }[];
      expect(tables.map((t) => t.name)).toEqual([
        'port_allocations',
        'reservations',
        'sessions',
      ]);
    });
  });

  describe('session CRUD', () => {
    it('creates and retrieves a session', () => {
      createDbSession(db, {
        id: '/path/to/session',
        branch: 'feature/auth',
        created_at: '2024-01-01T00:00:00Z',
      });
      const session = getDbSession(db, '/path/to/session');
      expect(session).toEqual({
        id: '/path/to/session',
        branch: 'feature/auth',
        created_at: '2024-01-01T00:00:00Z',
      });
    });

    it('returns undefined for missing session', () => {
      expect(getDbSession(db, '/nonexistent')).toBeUndefined();
    });

    it('lists sessions ordered by created_at', () => {
      createDbSession(db, {
        id: '/second',
        branch: null,
        created_at: '2024-01-02T00:00:00Z',
      });
      createDbSession(db, {
        id: '/first',
        branch: 'main',
        created_at: '2024-01-01T00:00:00Z',
      });
      const sessions = listDbSessions(db);
      expect(sessions).toHaveLength(2);
      expect(sessions[0].id).toBe('/first');
      expect(sessions[1].id).toBe('/second');
    });

    it('deletes a session', () => {
      createDbSession(db, {
        id: '/path',
        branch: null,
        created_at: '2024-01-01T00:00:00Z',
      });
      deleteDbSession(db, '/path');
      expect(getDbSession(db, '/path')).toBeUndefined();
    });

    it('throws on duplicate session ID', () => {
      createDbSession(db, {
        id: '/path',
        branch: null,
        created_at: '2024-01-01T00:00:00Z',
      });
      expect(() =>
        createDbSession(db, {
          id: '/path',
          branch: null,
          created_at: '2024-01-01T00:00:00Z',
        })
      ).toThrow();
    });
  });

  describe('port allocation', () => {
    beforeEach(() => {
      createDbSession(db, {
        id: '/session1',
        branch: null,
        created_at: '2024-01-01T00:00:00Z',
      });
    });

    it('allocates ports for services', async () => {
      const allocations = await allocatePorts(db, '/session1', [
        'postgres',
        'app',
      ]);
      expect(allocations).toHaveLength(2);
      expect(allocations[0].service).toBe('postgres');
      expect(allocations[0].port).toBeGreaterThan(0);
      expect(allocations[1].service).toBe('app');
      expect(allocations[1].port).toBeGreaterThan(0);
      expect(allocations[0].port).not.toBe(allocations[1].port);
    });

    it('retrieves port allocations', async () => {
      await allocatePorts(db, '/session1', ['postgres']);
      const ports = getPortAllocations(db, '/session1');
      expect(ports).toHaveLength(1);
      expect(ports[0].service).toBe('postgres');
    });

    it('returns all allocated ports', async () => {
      await allocatePorts(db, '/session1', ['postgres', 'app']);
      const ports = getAllocatedPorts(db);
      expect(ports).toHaveLength(2);
    });

    it('prevents duplicate ports across sessions', async () => {
      const alloc1 = await allocatePorts(db, '/session1', ['postgres']);

      createDbSession(db, {
        id: '/session2',
        branch: null,
        created_at: '2024-01-02T00:00:00Z',
      });
      const alloc2 = await allocatePorts(db, '/session2', ['postgres']);

      expect(alloc1[0].port).not.toBe(alloc2[0].port);
    });

    it('cascades delete to port_allocations', async () => {
      await allocatePorts(db, '/session1', ['postgres']);
      deleteDbSession(db, '/session1');
      expect(getAllocatedPorts(db)).toHaveLength(0);
    });

    it('returns empty array for no services', async () => {
      const result = await allocatePorts(db, '/session1', []);
      expect(result).toEqual([]);
    });
  });

  describe('reservations', () => {
    it('reserves and unreserves ports', () => {
      reservePort(db, 5432, 'manual');
      expect(getReservedPorts(db)).toEqual([5432]);
      unreservePort(db, 5432);
      expect(getReservedPorts(db)).toEqual([]);
    });

    it('excludes reserved ports from allocation', async () => {
      createDbSession(db, {
        id: '/session1',
        branch: null,
        created_at: '2024-01-01T00:00:00Z',
      });
      reservePort(db, 5432, 'manual');
      const allocations = await allocatePorts(db, '/session1', [
        'postgres',
      ]);
      expect(allocations[0].port).not.toBe(5432);
    });
  });
});
