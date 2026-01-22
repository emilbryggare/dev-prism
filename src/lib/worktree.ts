import { existsSync, rmSync } from 'node:fs';
import { execa } from 'execa';

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

export async function listWorktrees(projectRoot: string): Promise<Array<{
  path: string;
  branch: string;
  commit: string;
}>> {
  const { stdout } = await execa('git', ['worktree', 'list', '--porcelain'], {
    cwd: projectRoot,
  });

  const worktrees: Array<{ path: string; branch: string; commit: string }> = [];
  let current: { path: string; branch: string; commit: string } | null = null;

  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) {
        worktrees.push(current);
      }
      current = { path: line.replace('worktree ', ''), branch: '', commit: '' };
    } else if (line.startsWith('HEAD ') && current) {
      current.commit = line.replace('HEAD ', '');
    } else if (line.startsWith('branch ') && current) {
      current.branch = line.replace('branch refs/heads/', '');
    }
  }

  if (current) {
    worktrees.push(current);
  }

  return worktrees;
}

export async function getSessionWorktrees(projectRoot: string): Promise<Array<{
  sessionId: string;
  path: string;
  branch: string;
}>> {
  const worktrees = await listWorktrees(projectRoot);

  // Match session directories by path pattern: .../session-XXX
  const sessionPattern = /\/session-(\d{3})$/;

  return worktrees
    .filter((wt) => sessionPattern.test(wt.path))
    .map((wt) => {
      const match = wt.path.match(sessionPattern);
      return {
        sessionId: match![1],
        path: wt.path,
        branch: wt.branch,
      };
    });
}
