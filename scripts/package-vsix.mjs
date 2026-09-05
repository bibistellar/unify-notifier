import fs from 'node:fs';
import path from 'node:path';
import { createVSIX } from '@vscode/vsce';

const root = path.resolve(import.meta.dirname, '..');
const artifacts = path.join(root, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });

const packages = [
  ['vscode-ui', 'unify-notifier-ui-0.1.0.vsix'],
  ['vscode-router', 'unify-notifier-router-0.1.0.vsix'],
  ['vscode-pack', 'unify-notifier-0.1.0.vsix']
];

for (const [name, output] of packages) {
  const cwd = path.join(root, 'packages', name);
  const packagePath = path.join(artifacts, output);
  await createVSIX({ cwd, packagePath });
  console.log(`Packaged ${path.relative(root, packagePath)}`);
}
