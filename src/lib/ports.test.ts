import { describe, it, expect } from 'vitest';
import { extractPorts, formatPortsTable } from './ports.js';
import type { PortMapping } from './docker-inspect.js';

describe('extractPorts', () => {
  it('extracts ports from port mappings', () => {
    const mappings: PortMapping[] = [
      { service: 'postgres', internalPort: 5432, externalPort: 54321 },
      { service: 'redis', internalPort: 6379, externalPort: 63790 },
      { service: 'app', internalPort: 3000, externalPort: 30001 },
    ];
    const ports = extractPorts(mappings);
    expect(ports).toEqual({
      POSTGRES_PORT: 54321,
      REDIS_PORT: 63790,
      APP_PORT: 30001,
    });
  });

  it('handles empty port mappings', () => {
    const ports = extractPorts([]);
    expect(ports).toEqual({});
  });

  it('uppercases service names', () => {
    const mappings: PortMapping[] = [
      { service: 'my-service', internalPort: 8080, externalPort: 8081 },
    ];
    const ports = extractPorts(mappings);
    expect(ports).toEqual({
      'MY-SERVICE_PORT': 8081,
    });
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
