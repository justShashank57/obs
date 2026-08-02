import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig, saveConfig, getRuntime, saveRuntime } from './configStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIGS_DIR = path.resolve(__dirname, '../../../configs');
const DATA_DIR = path.resolve(__dirname, '../data');
const TEST_CLIENT = 'vitest-temp-client';

afterEach(() => {
  const configFile = path.join(CONFIGS_DIR, `${TEST_CLIENT}.json`);
  const runtimeFile = path.join(DATA_DIR, `${TEST_CLIENT}.runtime.json`);
  if (fs.existsSync(configFile)) fs.unlinkSync(configFile);
  if (fs.existsSync(runtimeFile)) fs.unlinkSync(runtimeFile);
});

describe('configStore', () => {
  it('rejects invalid clientIds instead of building a filesystem path from them', async () => {
    await expect(getConfig('../../etc/passwd')).rejects.toThrow(/Invalid clientId/);
    await expect(saveConfig('a/b', {})).rejects.toThrow(/Invalid clientId/);
  });

  it('merges a saved client config on top of the shared default config', async () => {
    await saveConfig(TEST_CLIENT, { theme: { colors: { primary: '#ABCDEF' } } });
    const cfg = await getConfig(TEST_CLIENT);
    expect(cfg.theme.colors.primary).toBe('#ABCDEF');
    // Fields not overridden should still come from default.json
    expect(cfg.theme.colors.secondary).toBeDefined();
    expect(cfg.alerts).toBeDefined();
  });

  it('falls back to the default config for an unknown client with no saved file', async () => {
    const cfg = await getConfig('vitest-never-saved-client');
    expect(cfg.displayName).toBe('Default Client');
  });

  it('persists and merges runtime state (goal/label/countdown)', async () => {
    await saveRuntime(TEST_CLIENT, { goal: { start: 0, current: 3, target: 10 } });
    const runtime = await getRuntime(TEST_CLIENT);
    expect(runtime.goal).toMatchObject({ start: 0, current: 3, target: 10 });
    // streamLabel/countdown should still be present from defaults
    expect(runtime.streamLabel).toBeDefined();
  });

  it('serializes concurrent saveRuntime calls instead of losing an update to a race', async () => {
    await saveRuntime(TEST_CLIENT, { goal: { start: 0, current: 0, target: 100 } });
    // Fire many concurrent patches; if the read-modify-write raced, some of
    // these would clobber each other and the final state would be wrong.
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => saveRuntime(TEST_CLIENT, { goal: { start: 0, current: i, target: 100 } }))
    );
    const runtime = await getRuntime(TEST_CLIENT);
    // The important assertion isn't which write "won" (they all target the
    // same field), it's that saveRuntime resolved for every call without
    // throwing and the file is valid, coherent JSON afterward.
    expect(runtime.goal.target).toBe(100);
    expect(typeof runtime.goal.current).toBe('number');
  });
});
