import { describe, it, expect } from 'vitest';
import { calculatePorts, formatPortsTable } from './ports.js';
import type { SessionConfig } from './config.js';

const baseConfig: SessionConfig = {
  portBase: 47000,
  sessionsDir: '../sessions',
  ports: {
    POSTGRES_PORT: 10,
    REDIS_PORT: 11,
    APP_PORT: 0,
  },
  setup: [],
};

describe('calculatePorts', () => {
  it('calculates ports for session 001', () => {
    const ports = calculatePorts(baseConfig, '001');
    expect(ports).toEqual({
      POSTGRES_PORT: 47110,
      REDIS_PORT: 47111,
      APP_PORT: 47100,
    });
  });

  it('calculates ports for session 005', () => {
    const ports = calculatePorts(baseConfig, '005');
    expect(ports).toEqual({
      POSTGRES_PORT: 47510,
      REDIS_PORT: 47511,
      APP_PORT: 47500,
    });
  });

  it('handles empty ports config', () => {
    const config: SessionConfig = {
      ...baseConfig,
      ports: {},
    };
    const ports = calculatePorts(config, '001');
    expect(ports).toEqual({});
  });

  it('handles different port base', () => {
    const config: SessionConfig = {
      ...baseConfig,
      portBase: 50000,
    };
    const ports = calculatePorts(config, '002');
    expect(ports.POSTGRES_PORT).toBe(50210);
  });
});

describe('formatPortsTable', () => {
  it('formats ports as indented lines', () => {
    const ports = { POSTGRES_PORT: 47110, REDIS_PORT: 47111 };
    const result = formatPortsTable(ports);
    expect(result).toBe('  POSTGRES_PORT: http://localhost:47110\n  REDIS_PORT: http://localhost:47111');
  });

  it('handles empty ports', () => {
    const result = formatPortsTable({});
    expect(result).toBe('');
  });

  it('handles single port', () => {
    const result = formatPortsTable({ PORT: 3000 });
    expect(result).toBe('  PORT: http://localhost:3000');
  });
});
