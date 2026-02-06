import { execa } from 'execa';

export interface ContainerInfo {
  id: string;
  name: string;
  state: string;
  labels: Record<string, string>;
  ports: Array<{
    privatePort: number;
    publicPort?: number;
    type: string;
  }>;
}

export interface PortMapping {
  service: string;
  internalPort: number;
  externalPort: number;
}

const DEV_PRISM_LABEL = 'dev-prism.managed=true';

// Query all dev-prism managed containers
export async function listManagedContainers(): Promise<ContainerInfo[]> {
  try {
    const result = await execa('docker', [
      'ps',
      '--filter',
      `label=${DEV_PRISM_LABEL}`,
      '--format',
      '{{json .}}',
    ]);

    if (!result.stdout.trim()) {
      return [];
    }

    // Docker outputs one JSON object per line
    return result.stdout
      .trim()
      .split('\n')
      .map((line) => {
        const raw = JSON.parse(line);
        return {
          id: raw.ID,
          name: raw.Names,
          state: raw.State,
          labels: parseLabels(raw.Labels),
          ports: [], // Will be filled in by inspectContainer if needed
        };
      });
  } catch (error) {
    // If docker command fails, return empty array
    console.error('Failed to list containers:', error);
    return [];
  }
}

// Parse Docker labels string format "key1=value1,key2=value2" into object
function parseLabels(labelsStr: string): Record<string, string> {
  if (!labelsStr) return {};

  const labels: Record<string, string> = {};
  const pairs = labelsStr.split(',');

  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split('=');
    if (key) {
      labels[key] = valueParts.join('='); // Rejoin in case value contains '='
    }
  }

  return labels;
}

// Inspect a single container to get detailed port mappings
export async function inspectContainer(containerId: string): Promise<ContainerInfo | null> {
  try {
    const result = await execa('docker', ['inspect', containerId]);
    const data = JSON.parse(result.stdout);

    if (!data || data.length === 0) {
      return null;
    }

    const container = data[0];
    const ports: Array<{ privatePort: number; publicPort?: number; type: string }> = [];

    // Parse port bindings from NetworkSettings.Ports
    // Format: { "5432/tcp": [{ "HostIp": "", "HostPort": "54321" }], ... }
    const portBindings = container.NetworkSettings?.Ports || {};

    for (const [portSpec, bindings] of Object.entries(portBindings)) {
      const [portStr, protocol] = portSpec.split('/');
      const privatePort = parseInt(portStr, 10);

      if (Array.isArray(bindings) && bindings.length > 0) {
        const binding = bindings[0] as { HostPort: string };
        const publicPort = parseInt(binding.HostPort, 10);
        ports.push({
          privatePort,
          publicPort,
          type: protocol,
        });
      }
    }

    return {
      id: container.Id,
      name: container.Name.replace(/^\//, ''), // Remove leading slash
      state: container.State.Status,
      labels: container.Config.Labels || {},
      ports,
    };
  } catch (error) {
    console.error(`Failed to inspect container ${containerId}:`, error);
    return null;
  }
}

// Get port mappings for a specific working directory
export async function getPortMappings(workingDir: string): Promise<PortMapping[]> {
  const containers = await listManagedContainers();
  const sessionContainers = containers.filter(
    (c) => c.labels['dev-prism.working_dir'] === workingDir
  );

  const mappings: PortMapping[] = [];

  for (const container of sessionContainers) {
    // Get detailed port info
    const detailed = await inspectContainer(container.id);
    if (!detailed) continue;

    const serviceName = detailed.labels['dev-prism.service'];
    if (!serviceName) continue;

    for (const port of detailed.ports) {
      if (port.publicPort) {
        mappings.push({
          service: serviceName,
          internalPort: port.privatePort,
          externalPort: port.publicPort,
        });
      }
    }
  }

  return mappings;
}

// Group containers by working directory
export function groupContainersByWorkingDir(containers: ContainerInfo[]): Map<string, ContainerInfo[]> {
  const groups = new Map<string, ContainerInfo[]>();

  for (const container of containers) {
    const workingDir = container.labels['dev-prism.working_dir'];
    if (!workingDir) continue;

    if (!groups.has(workingDir)) {
      groups.set(workingDir, []);
    }
    groups.get(workingDir)!.push(container);
  }

  return groups;
}

// Check if a session exists for a working directory
export async function sessionExists(workingDir: string): Promise<boolean> {
  const containers = await listManagedContainers();
  return containers.some((c) => c.labels['dev-prism.working_dir'] === workingDir);
}

// Get the compose project name for a working directory
export async function getComposeProject(workingDir: string): Promise<string | null> {
  const containers = await listManagedContainers();
  const container = containers.find((c) => c.labels['dev-prism.working_dir'] === workingDir);
  return container?.labels['com.docker.compose.project'] || null;
}
