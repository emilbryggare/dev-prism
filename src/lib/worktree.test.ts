import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateDefaultBranchName } from './worktree.js';

describe('generateDefaultBranchName', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates branch name with timestamp', () => {
    vi.setSystemTime(new Date('2024-03-15T14:30:00Z'));
    const result = generateDefaultBranchName();
    expect(result).toMatch(/^session\/2024-03-15T14-30-/);
  });

  it('includes ISO timestamp in branch name', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const result = generateDefaultBranchName();
    expect(result).toMatch(/^session\/2024-01-01T00-00-/);
  });
});
