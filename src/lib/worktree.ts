import { existsSync, rmSync } from 'node:fs';
import { execa } from 'execa';

export class NotAGitRepositoryError extends Error {
  constructor() {
    super('Not a git repository');
    this.name = 'NotAGitRepositoryError';
  }
}

export async function isGitRepository(path: string): Promise<boolean> {
  try {
    await execa('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: path,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

async function branchExists(projectRoot: string, branchName: string): Promise<boolean> {
  try {
    await execa('git', ['rev-parse', '--verify', branchName], {
      cwd: projectRoot,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

export async function findNextSessionId(projectRoot: string, sessionsDir?: string): Promise<string> {
  const sessions = await getSessionWorktrees(projectRoot);
  const usedIds = new Set(sessions.map((s) => parseInt(s.sessionId, 10)));

  for (let i = 1; i <= 999; i++) {
    if (!usedIds.has(i)) {
      const sessionId = String(i).padStart(3, '0');
      // Also check if directory exists on disk (orphaned from previous runs)
      if (sessionsDir) {
        const sessionDir = `${sessionsDir}/session-${sessionId}`;
        if (existsSync(sessionDir)) {
          continue; // Skip this ID, directory exists
        }
      }
      return sessionId;
    }
  }
  throw new Error('No available session IDs (001-999 all in use)');
}

export function generateDefaultBranchName(sessionId: string): string {
  const today = new Date().toISOString().split('T')[0];
  return `session/${today}/${sessionId}`;
}

export async function createWorktree(
  projectRoot: string,
  sessionDir: string,
  branchName: string
): Promise<void> {
  // Check if worktree already exists
  if (existsSync(sessionDir)) {
    throw new Error(`Session directory already exists: ${sessionDir}`);
  }

  const exists = await branchExists(projectRoot, branchName);

  if (exists) {
    // Attach to existing branch
    await execa('git', ['worktree', 'add', sessionDir, branchName], {
      cwd: projectRoot,
      stdio: 'inherit',
    });
  } else {
    // Create worktree with new branch from HEAD
    await execa('git', ['worktree', 'add', sessionDir, '-b', branchName, 'HEAD'], {
      cwd: projectRoot,
      stdio: 'inherit',
    });
  }
}

export async function removeWorktree(
  projectRoot: string,
  sessionDir: string,
  branchName: string
): Promise<void> {
  // Check if worktree exists
  if (existsSync(sessionDir)) {
    // Force remove worktree
    try {
      await execa('git', ['worktree', 'remove', '--force', sessionDir], {
        cwd: projectRoot,
        stdio: 'inherit',
      });
    } catch {
      // If git worktree remove fails, manually remove the directory
      rmSync(sessionDir, { recursive: true, force: true });
    }
  }

  // Delete the branch
  try {
    await execa('git', ['branch', '-D', branchName], {
      cwd: projectRoot,
      stdio: 'pipe', // Don't show output, branch might not exist
    });
  } catch {
    // Branch might not exist, ignore error
  }
}

export interface Worktree {
  path: string;
  branch: string;
  commit: string;
}

// Parse git worktree list --porcelain output
export function parseWorktreeOutput(stdout: string): Worktree[] {
  const worktrees: Worktree[] = [];
  let current: Worktree | null = null;

  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) {
        worktrees.push(current);
      }
      current = { path: line.slice(9), branch: '', commit: '' };
    } else if (line.startsWith('HEAD ') && current) {
      current.commit = line.slice(5);
    } else if (line.startsWith('branch ') && current) {
      current.branch = line.slice(18); // 'branch refs/heads/'.length
    }
  }

  if (current) {
    worktrees.push(current);
  }

  return worktrees;
}

export async function listWorktrees(projectRoot: string): Promise<Worktree[]> {
  if (!(await isGitRepository(projectRoot))) {
    throw new NotAGitRepositoryError();
  }

  const { stdout } = await execa('git', ['worktree', 'list', '--porcelain'], {
    cwd: projectRoot,
  });

  return parseWorktreeOutput(stdout);
}

export interface SessionWorktree {
  sessionId: string;
  path: string;
  branch: string;
}

// Filter worktrees to only session directories (pattern: .../session-XXX)
export function filterSessionWorktrees(worktrees: Worktree[]): SessionWorktree[] {
  const sessionPattern = /\/session-(\d{3})$/;

  return worktrees.flatMap((wt) => {
    const match = wt.path.match(sessionPattern);
    if (!match) return [];
    return [{ sessionId: match[1], path: wt.path, branch: wt.branch }];
  });
}

export async function getSessionWorktrees(projectRoot: string): Promise<SessionWorktree[]> {
  const worktrees = await listWorktrees(projectRoot);
  return filterSessionWorktrees(worktrees);
}
