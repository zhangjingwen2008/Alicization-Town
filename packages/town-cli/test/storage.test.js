const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { resolveStorageRoot } = require('../../../shared/town-client/config');

describe('Town client storage paths', () => {
  it('prefers ALICIZATION_TOWN_HOME when explicitly set', () => {
    const resolved = resolveStorageRoot({
      env: { ALICIZATION_TOWN_HOME: '/tmp/town-home' },
      projectRoot: '/workspace/project',
      projectName: 'Alicization-Town',
    });
    assert.equal(resolved, path.resolve('/tmp/town-home'));
  });

  it('resolves the default user-home storage path on macOS', () => {
    const resolved = resolveStorageRoot({
      env: {},
      homedir: '/Users/example',
      projectName: 'Alicization-Town',
    });
    assert.equal(resolved, '/Users/example/.agents/Alicization-Town');
  });

  it('resolves the default user-home storage path on Windows', () => {
    const resolved = resolveStorageRoot({
      env: {},
      homedir: 'C:\\Users\\example',
      projectName: 'Alicization-Town',
    });
    assert.equal(resolved, path.join('C:\\Users\\example', '.agents', 'Alicization-Town'));
  });

  it('resolves the default user-home storage path on Linux', () => {
    const resolved = resolveStorageRoot({
      env: {},
      homedir: '/home/example',
      projectName: 'Alicization-Town',
    });
    assert.equal(resolved, '/home/example/.agents/Alicization-Town');
  });
});
