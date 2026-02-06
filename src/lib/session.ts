import type { ContainerInfo, PortMapping } from './docker-inspect.js';
import { listManagedContainers, inspectContainer, groupContainersByWorkingDir } from './docker-inspect.js';

export interface Session {
  sessionId: string; // Full working directory path
  workingDir: string;
  running: boolean;
  containers: ContainerInfo[];
  ports: PortMapping[];
  createdAt: string | null;
}

// Build a session object from Docker container state
export async function buildSession(workingDir: string, containers: ContainerInfo[]): Promise<Session> {
  const ports: PortMapping[] = [];

  // Get detailed port info for each container
  for (const container of containers) {
    const detailed = await inspectContainer(container.id);
    if (!detailed) continue;

    const serviceName = detailed.labels['dev-prism.service'];
    if (!serviceName) continue;

    for (const port of detailed.ports) {
      if (port.publicPort) {
        ports.push({
          service: serviceName,
          internalPort: port.privatePort,
          externalPort: port.publicPort,
        });
      }
    }
  }

  // Get creation timestamp from first container
  const createdAt = containers[0]?.labels['dev-prism.created_at'] || null;

  return {
    sessionId: workingDir,
    workingDir,
    running: containers.some((c) => c.state === 'running'),
    containers,
    ports,
    createdAt,
  };
}

// List all active sessions by querying Docker
export async function listActiveSessions(): Promise<Session[]> {
  const containers = await listManagedContainers();
  const grouped = groupContainersByWorkingDir(containers);

  const sessions: Session[] = [];

  for (const [workingDir, containerList] of grouped.entries()) {
    const session = await buildSession(workingDir, containerList);
    sessions.push(session);
  }

  // Sort by working directory path
  sessions.sort((a, b) => a.workingDir.localeCompare(b.workingDir));

  return sessions;
}

// Get session for a specific working directory
export async function getSession(workingDir: string): Promise<Session | null> {
  const containers = await listManagedContainers();
  const sessionContainers = containers.filter(
    (c) => c.labels['dev-prism.working_dir'] === workingDir
  );

  if (sessionContainers.length === 0) {
    return null;
  }

  return buildSession(workingDir, sessionContainers);
}

// Format ports for display
export function formatPorts(ports: PortMapping[]): string {
  if (ports.length === 0) {
    return '  No ports exposed';
  }

  const lines: string[] = [];
  for (const port of ports) {
    lines.push(`  ${port.service}: http://localhost:${port.externalPort}`);
  }
  return lines.join('\n');
}
