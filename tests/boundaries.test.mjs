import { it, expect } from 'vitest';
import { violations } from '../scripts/check-boundaries.mjs';
it('rejects browser persistence and private cross-module imports', () => {
  expect(violations("import { db } from '@auditsphere/server'", 'web')).toContain('browser imports server persistence');
  expect(violations("import { db } from '../../packages/server/src/platform/db.js'", 'web')).toContain('browser imports server persistence');
  expect(violations("import { invoice } from '../practice/service.js'", 'commercial')).toHaveLength(1);
  expect(violations("import { invoice } from '../practice/public.js'", 'commercial')).toHaveLength(0);
  expect(violations("import { invoice } from '../practice/public.js'; import { write } from '../practice/service.js'", 'commercial')).toHaveLength(1);
  expect(violations("import { states } from '@auditsphere/contracts'", 'web')).toHaveLength(0);
});
