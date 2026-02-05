import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionStore } from './store.js';

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  describe('insert', () => {
    it('inserts a session and returns the row', () => {
      const row = store.insert({
        sessionId: '001',
        projectRoot: '/projects/my-app',
        sessionDir: '/sessions/session-001',
        branch: 'session/2025-01-01/001',
        mode: 'docker',
        inPlace: false,
      });

      expect(row.id).toBe(1);
      expect(row.session_id).toBe('001');
      expect(row.project_root).toBe('/projects/my-app');
      expect(row.session_dir).toBe('/sessions/session-001');
      expect(row.branch).toBe('session/2025-01-01/001');
      expect(row.mode).toBe('docker');
      expect(row.in_place).toBe(0);
      expect(row.destroyed_at).toBeNull();
    });

    it('uses defaults for optional fields', () => {
      const row = store.insert({
        sessionId: '002',
        projectRoot: '/projects/my-app',
        sessionDir: '/projects/my-app',
      });

      expect(row.branch).toBe('');
      expect(row.mode).toBe('docker');
      expect(row.in_place).toBe(0);
    });

    it('sets in_place flag', () => {
      const row = store.insert({
        sessionId: '003',
        projectRoot: '/projects/my-app',
        sessionDir: '/projects/my-app',
        inPlace: true,
      });

      expect(row.in_place).toBe(1);
    });

    it('rejects duplicate session_id', () => {
      store.insert({
        sessionId: '001',
        projectRoot: '/projects/my-app',
        sessionDir: '/sessions/session-001',
      });

      expect(() =>
        store.insert({
          sessionId: '001',
          projectRoot: '/projects/my-app',
          sessionDir: '/sessions/session-001-dup',
        })
      ).toThrow(/UNIQUE constraint/);
    });

    it('rejects same session_id in different projects', () => {
      store.insert({
        sessionId: '001',
        projectRoot: '/projects/app-a',
        sessionDir: '/sessions/a/session-001',
      });

      expect(() =>
        store.insert({
          sessionId: '001',
          projectRoot: '/projects/app-b',
          sessionDir: '/sessions/b/session-001',
        })
      ).toThrow(/UNIQUE constraint/);
    });
  });

  describe('listByProject', () => {
    it('returns active sessions for a project', () => {
      store.insert({ sessionId: '001', projectRoot: '/p', sessionDir: '/s/001' });
      store.insert({ sessionId: '002', projectRoot: '/p', sessionDir: '/s/002' });
      store.insert({ sessionId: '003', projectRoot: '/other', sessionDir: '/s/003' });

      const sessions = store.listByProject('/p');
      expect(sessions).toHaveLength(2);
      expect(sessions[0].session_id).toBe('001');
      expect(sessions[1].session_id).toBe('002');
    });

    it('excludes destroyed sessions', () => {
      store.insert({ sessionId: '001', projectRoot: '/p', sessionDir: '/s/001' });
      store.insert({ sessionId: '002', projectRoot: '/p', sessionDir: '/s/002' });
      store.markDestroyed('/p', '001');

      const sessions = store.listByProject('/p');
      expect(sessions).toHaveLength(1);
      expect(sessions[0].session_id).toBe('002');
    });
  });

  describe('listAll', () => {
    it('returns all active sessions across projects', () => {
      store.insert({ sessionId: '001', projectRoot: '/a', sessionDir: '/s/a/001' });
      store.insert({ sessionId: '002', projectRoot: '/b', sessionDir: '/s/b/002' });

      const sessions = store.listAll();
      expect(sessions).toHaveLength(2);
    });
  });

  describe('findSession', () => {
    it('finds an active session by project and id', () => {
      store.insert({ sessionId: '001', projectRoot: '/p', sessionDir: '/s/001' });

      const session = store.findSession('/p', '001');
      expect(session).toBeDefined();
      expect(session!.session_id).toBe('001');
    });

    it('returns undefined for destroyed sessions', () => {
      store.insert({ sessionId: '001', projectRoot: '/p', sessionDir: '/s/001' });
      store.markDestroyed('/p', '001');

      expect(store.findSession('/p', '001')).toBeUndefined();
    });

    it('returns undefined for non-existent sessions', () => {
      expect(store.findSession('/p', '999')).toBeUndefined();
    });
  });

  describe('findByDir', () => {
    it('finds a session by directory', () => {
      store.insert({ sessionId: '001', projectRoot: '/p', sessionDir: '/s/001' });

      const session = store.findByDir('/s/001');
      expect(session).toBeDefined();
      expect(session!.session_id).toBe('001');
    });

    it('returns undefined for unknown directory', () => {
      expect(store.findByDir('/unknown')).toBeUndefined();
    });
  });

  describe('getUsedSessionIds', () => {
    it('returns all active session ids across projects', () => {
      store.insert({ sessionId: '001', projectRoot: '/a', sessionDir: '/s/a/001' });
      store.insert({ sessionId: '003', projectRoot: '/b', sessionDir: '/s/b/003' });
      store.insert({ sessionId: '005', projectRoot: '/a', sessionDir: '/s/a/005' });
      store.markDestroyed('/b', '003');

      const ids = store.getUsedSessionIds();
      expect(ids).toEqual(new Set(['001', '005']));
    });
  });

  describe('markDestroyed', () => {
    it('marks session as destroyed and returns true', () => {
      store.insert({ sessionId: '001', projectRoot: '/p', sessionDir: '/s/001' });

      const result = store.markDestroyed('/p', '001');
      expect(result).toBe(true);

      // Should no longer appear in active queries
      expect(store.findSession('/p', '001')).toBeUndefined();
    });

    it('returns false for non-existent session', () => {
      expect(store.markDestroyed('/p', '999')).toBe(false);
    });

    it('returns false if already destroyed', () => {
      store.insert({ sessionId: '001', projectRoot: '/p', sessionDir: '/s/001' });
      store.markDestroyed('/p', '001');

      expect(store.markDestroyed('/p', '001')).toBe(false);
    });
  });

  describe('migrate', () => {
    it('migrates old schema with composite unique constraint to global unique', () => {
      const dir = join(tmpdir(), `dev-prism-test-${Date.now()}`);
      mkdirSync(dir, { recursive: true });
      const dbPath = join(dir, 'test.db');

      try {
        // Create a DB with the old schema (composite UNIQUE)
        const oldDb = new Database(dbPath);
        oldDb.exec(`
          CREATE TABLE sessions (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id    TEXT NOT NULL,
            project_root  TEXT NOT NULL,
            session_dir   TEXT NOT NULL,
            branch        TEXT NOT NULL DEFAULT '',
            mode          TEXT NOT NULL DEFAULT 'docker',
            in_place      INTEGER NOT NULL DEFAULT 0,
            created_at    TEXT NOT NULL DEFAULT (datetime('now')),
            destroyed_at  TEXT,
            UNIQUE(session_id, project_root)
          );
        `);
        // Insert duplicate session IDs across projects (allowed by old schema)
        oldDb.exec(`
          INSERT INTO sessions (session_id, project_root, session_dir) VALUES ('001', '/a', '/s/a/001');
          INSERT INTO sessions (session_id, project_root, session_dir) VALUES ('001', '/b', '/s/b/001');
          INSERT INTO sessions (session_id, project_root, session_dir) VALUES ('002', '/a', '/s/a/002');
        `);
        oldDb.close();

        // Open with SessionStore which should trigger migration
        const store2 = new SessionStore(dbPath);
        const sessions = store2.listAll();
        // Duplicate 001 should be deduplicated — one kept, one dropped
        const ids = sessions.map((s) => s.session_id);
        expect(ids).toContain('001');
        expect(ids).toContain('002');
        expect(ids.filter((id) => id === '001')).toHaveLength(1);

        // New inserts with duplicate session_id should be rejected
        expect(() =>
          store2.insert({ sessionId: '002', projectRoot: '/b', sessionDir: '/s/b/002' })
        ).toThrow(/UNIQUE constraint/);

        store2.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('remove', () => {
    it('permanently deletes a session row', () => {
      store.insert({ sessionId: '001', projectRoot: '/p', sessionDir: '/s/001' });

      const result = store.remove('/p', '001');
      expect(result).toBe(true);
      expect(store.findSession('/p', '001')).toBeUndefined();
    });

    it('returns false for non-existent session', () => {
      expect(store.remove('/p', '999')).toBe(false);
    });
  });
});
