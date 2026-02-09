import { describe, it, expect } from 'vitest';
import { getSessionsDir } from './config.js';
import type { SessionConfig } from './config.js';

const baseConfig: SessionConfig = {
  sessionsDir: '../sessions',
  ports: [],
  setup: [],
};

describe('getSessionsDir', () => {
  it('resolves sessions dir relative to project root', () => {
    const result = getSessionsDir(baseConfig, '/home/user/project');
    expect(result).toBe('/home/user/sessions');
  });

  it('handles absolute sessionsDir', () => {
    const config: SessionConfig = {
      ...baseConfig,
      sessionsDir: '/var/sessions',
    };
    const result = getSessionsDir(config, '/home/user/project');
    expect(result).toBe('/var/sessions');
  });
});
