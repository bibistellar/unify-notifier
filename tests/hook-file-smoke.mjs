import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parse } = require('jsonc-parser');
const modulePath = path.resolve(import.meta.dirname, '..', 'packages', 'vscode-router', 'dist', 'agent-config.js');
const { mergeHooksIntoSettingsFile, removeHooksFromSettingsFile } = require(modulePath);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unify-hook-file-test-'));
const file = path.join(dir, 'settings.json');
const original = `{
  // this comment and unrelated setting must survive
  "theme": "dark",
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command", "command": "echo existing" }] }
    ]
  }
}\n`;
fs.writeFileSync(file, original, { mode: 0o600 });

const managed = {
  Stop: [{ hooks: [{ type: 'command', command: 'unify completed' }] }],
  PermissionRequest: [{ hooks: [{ type: 'command', command: 'unify approval' }] }]
};

try {
  const first = mergeHooksIntoSettingsFile(file, managed);
  assert.equal(first.changed, true);
  assert.ok(first.backup && fs.existsSync(first.backup), 'existing settings must be backed up');
  assert.equal(fs.readFileSync(first.backup, 'utf8'), original, 'backup must contain the exact original file');

  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /this comment and unrelated setting must survive/);
  const parsed = parse(text);
  assert.equal(parsed.theme, 'dark');
  assert.equal(parsed.hooks.Stop.length, 2);
  assert.equal(parsed.hooks.PermissionRequest.length, 1);

  const second = mergeHooksIntoSettingsFile(file, managed);
  assert.equal(second.changed, false, 'configuration must be idempotent');

  const removed = removeHooksFromSettingsFile(file, managed);
  assert.equal(removed.changed, true);
  const after = parse(fs.readFileSync(file, 'utf8'));
  assert.equal(after.theme, 'dark');
  assert.equal(after.hooks.Stop.length, 1);
  assert.equal(after.hooks.Stop[0].hooks[0].command, 'echo existing');
  assert.equal(after.hooks.PermissionRequest, undefined);

  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(file).mode & 0o777, 0o600, 'settings permissions must be preserved');
  }

  console.log('Hook file smoke test passed');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
