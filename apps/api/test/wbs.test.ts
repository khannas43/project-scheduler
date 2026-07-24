import { describe, expect, it } from 'vitest';

import { childWbsPath, nlevel, remapWbsPath, wbsCodeFromPath } from '../src/services/wbs.js';

describe('WBS path helpers (§3.7)', () => {
  it('childWbsPath builds root and nested labels', () => {
    expect(childWbsPath(null, 1)).toBe('1');
    expect(childWbsPath(null, 3)).toBe('3');
    expect(childWbsPath('1', 2)).toBe('1.2');
    expect(childWbsPath('1.3', 4)).toBe('1.3.4');
  });

  it('remapWbsPath rewrites a subtree prefix (new || subpath(..., nlevel(old)))', () => {
    expect(remapWbsPath('1.3', '1.3', '2.1.4')).toBe('2.1.4');
    expect(remapWbsPath('1.3.2', '1.3', '2.1.4')).toBe('2.1.4.2');
    expect(remapWbsPath('1.3.2.7', '1.3', '9')).toBe('9.2.7');
  });

  it('remapWbsPath rejects paths outside the old prefix', () => {
    expect(() => remapWbsPath('1.4', '1.3', '2')).toThrow(/not under oldPrefix/);
  });

  it('nlevel matches Postgres label count', () => {
    expect(nlevel('1')).toBe(1);
    expect(nlevel('1.3.2')).toBe(3);
  });

  it('wbsCodeFromPath mirrors the ltree path for display', () => {
    expect(wbsCodeFromPath('1.3.2')).toBe('1.3.2');
  });
});
