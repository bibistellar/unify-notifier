import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVSIX } from '@vscode/vsce';

const root = path.resolve(import.meta.dirname, '..');
const artifacts = path.join(root, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });

const packages = [
  { name: 'vscode-ui', output: 'unify-notifier-ui-0.1.0.vsix', include: ['dist'] },
  { name: 'vscode-router', output: 'unify-notifier-router-0.1.0.vsix', include: ['dist', 'assets'] },
  { name: 'vscode-pack', output: 'unify-notifier-0.1.0.vsix', include: [] }
];

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'unify-notifier-vsix-'));

function copyIfPresent(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, destination, { recursive: true });
}

try {
  for (const spec of packages) {
    const source = path.join(root, 'packages', spec.name);
    const stage = path.join(stagingRoot, spec.name);
    fs.mkdirSync(stage, { recursive: true });

    for (const file of ['package.json', 'README.md']) {
      copyIfPresent(path.join(source, file), path.join(stage, file));
    }
    copyIfPresent(path.join(root, 'LICENSE'), path.join(stage, 'LICENSE'));
    for (const entry of spec.include) {
      copyIfPresent(path.join(source, entry), path.join(stage, entry));
    }

    const manifest = JSON.parse(fs.readFileSync(path.join(stage, 'package.json'), 'utf8'));
    if (manifest.dependencies && Object.keys(manifest.dependencies).length > 0) {
      execFileSync(npm, [
        'install',
        '--omit=dev',
        '--ignore-scripts',
        '--no-package-lock',
        '--no-audit',
        '--no-fund'
      ], { cwd: stage, stdio: 'inherit' });
    }

    const packagePath = path.join(artifacts, spec.output);
    await createVSIX({ cwd: stage, packagePath });
    console.log(`Packaged ${path.relative(root, packagePath)}`);
  }
} finally {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
}
