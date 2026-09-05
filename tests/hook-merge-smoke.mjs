import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const modulePath = path.resolve(import.meta.dirname, '..', 'packages', 'vscode-router', 'dist', 'agent-config.js');
const { mergeHookMap, removeHookMap } = require(modulePath);

const existing = {
  Stop: [{ hooks: [{ type: 'command', command: 'echo existing' }] }],
  PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo policy' }] }]
};
const additions = {
  Stop: [{ hooks: [{ type: 'command', command: 'unify completed' }] }],
  PermissionRequest: [{ hooks: [{ type: 'command', command: 'unify approval' }] }]
};

const merged = mergeHookMap(existing, additions);
assert.equal(merged.Stop.length, 2);
assert.equal(merged.PreToolUse.length, 1);
assert.equal(merged.PermissionRequest.length, 1);

const mergedAgain = mergeHookMap(merged, additions);
assert.equal(mergedAgain.Stop.length, 2, 'merge must be idempotent');
assert.equal(mergedAgain.PermissionRequest.length, 1, 'merge must not duplicate hooks');

const removed = removeHookMap(mergedAgain, additions);
assert.equal(removed.Stop.length, 1);
assert.equal(removed.Stop[0].hooks[0].command, 'echo existing');
assert.equal(removed.PreToolUse[0].hooks[0].command, 'echo policy');
assert.equal(removed.PermissionRequest, undefined);

console.log('Hook merge smoke test passed');
