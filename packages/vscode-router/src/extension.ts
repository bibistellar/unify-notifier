import * as childProcess from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { AgentNotification, RouteDescriptor } from '@unify-notifier/protocol';
import { AGENT_SPECS, AgentId, configureAgent, detectAgent, isAgentConfigured, removeAgent } from './agent-config';

const PROTOCOL_VERSION = 1 as const;
const UI_COMMAND = 'unifyNotifier.ui.notify';
let server: http.Server | undefined;
let routeFile: string | undefined;
let cliScriptPath: string | undefined;

function baseDir(): string {
  return path.join(os.homedir(), '.unify-notifier');
}

function routesDir(): string {
  return path.join(baseDir(), 'routes');
}

function binDir(): string {
  return path.join(baseDir(), 'bin');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function installCliShim(context: vscode.ExtensionContext): string {
  const dir = binDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const source = path.join(context.extensionPath, 'assets', 'unify-notifier-cli.js');
  const stableScript = path.join(dir, 'unify-notifier-cli.js');
  fs.copyFileSync(source, stableScript);
  cliScriptPath = stableScript;

  const shim = path.join(dir, 'unify-notifier');
  const executable = process.platform === 'win32' ? process.execPath.replace(/\\/g, '/') : process.execPath;
  const scriptForShell = process.platform === 'win32' ? stableScript.replace(/\\/g, '/') : stableScript;
  const body = `#!/bin/sh\nexec ${shellQuote(executable)} ${shellQuote(scriptForShell)} "$@"\n`;
  fs.writeFileSync(shim, body, { mode: 0o755 });

  if (process.platform === 'win32') {
    const cmd = path.join(dir, 'unify-notifier.cmd');
    fs.writeFileSync(cmd, `@echo off\r\n"${process.execPath}" "${stableScript}" %*\r\n`, 'utf8');
  }
  return shim;
}

function isNotification(value: unknown): value is AgentNotification {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AgentNotification>;
  return candidate.version === PROTOCOL_VERSION &&
    typeof candidate.agent === 'string' &&
    typeof candidate.event === 'string' &&
    ['completed', 'approval', 'input-required', 'failed', 'info'].includes(candidate.event);
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > 64 * 1024) throw new Error('Payload too large');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function writeJson(res: http.ServerResponse, status: number, body: Record<string, unknown>): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

function workspaceFolders(): string[] {
  return (vscode.workspace.workspaceFolders ?? [])
    .filter(folder => folder.uri.scheme === 'file')
    .map(folder => folder.uri.fsPath);
}

function cleanupOldRoutes(dir: string): void {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    try {
      if (fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file);
    } catch {}
  }
}

function agentItems(): Array<vscode.QuickPickItem & { id: AgentId }> {
  return (Object.keys(AGENT_SPECS) as AgentId[]).map(id => {
    const spec = AGENT_SPECS[id];
    const detected = detectAgent(id);
    const configured = isAgentConfigured(id);
    return {
      id,
      label: spec.label,
      description: configured ? 'Configured' : detected ? 'Detected' : 'Not detected',
      detail: spec.settingsPath,
      picked: detected
    };
  });
}

async function configureAgents(): Promise<void> {
  const picked = await vscode.window.showQuickPick(agentItems(), {
    canPickMany: true,
    title: 'Configure AI agent hooks',
    placeHolder: 'Select agents that should send notifications through Unify Notifier'
  });
  if (!picked?.length) return;

  const changed: string[] = [];
  const unchanged: string[] = [];
  for (const item of picked) {
    const result = configureAgent(item.id);
    (result.changed ? changed : unchanged).push(AGENT_SPECS[item.id].label);
  }

  const suffix = picked.some(item => item.id === 'codebuddy')
    ? ' CodeBuddy requires external hook changes to be reviewed in its /hooks panel.'
    : '';
  await vscode.window.showInformationMessage(
    `Unify Notifier hooks: ${changed.length ? `configured ${changed.join(', ')}` : 'no changes needed'}${unchanged.length ? `; already configured ${unchanged.join(', ')}` : ''}.${suffix}`
  );
}

async function removeAgents(): Promise<void> {
  const configured = agentItems().filter(item => isAgentConfigured(item.id));
  if (!configured.length) {
    await vscode.window.showInformationMessage('Unify Notifier has no managed agent hooks to remove.');
    return;
  }
  const picked = await vscode.window.showQuickPick(configured, {
    canPickMany: true,
    title: 'Remove Unify Notifier agent hooks'
  });
  if (!picked?.length) return;
  const removed: string[] = [];
  for (const item of picked) {
    if (removeAgent(item.id).changed) removed.push(AGENT_SPECS[item.id].label);
  }
  await vscode.window.showInformationMessage(`Removed Unify Notifier hooks from: ${removed.join(', ') || 'none'}.`);
}

async function testEndToEnd(): Promise<void> {
  if (!cliScriptPath) throw new Error('CLI shim is not installed');
  const cwd = workspaceFolders()[0] ?? process.cwd();
  await new Promise<void>((resolve, reject) => {
    childProcess.execFile(process.execPath, [
      cliScriptPath!,
      '--agent', 'unify-notifier',
      '--event', 'approval',
      '--title', 'End-to-end bridge test',
      '--message', `Router ${vscode.env.remoteName ?? 'local'} → local UI notification succeeded.`,
      '--cwd', cwd
    ], { timeout: 5000 }, error => error ? reject(error) : resolve());
  });
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const cliShim = installCliShim(context);
  const token = crypto.randomBytes(24).toString('hex');
  const instanceId = crypto.randomUUID();
  const dir = routesDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  cleanupOldRoutes(dir);

  server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/health' && req.method === 'GET') {
        writeJson(res, 200, { ok: true, version: PROTOCOL_VERSION });
        return;
      }
      if (req.url !== '/notify' || req.method !== 'POST') {
        writeJson(res, 404, { ok: false, error: 'not_found' });
        return;
      }
      if (req.headers.authorization !== `Bearer ${token}`) {
        writeJson(res, 401, { ok: false, error: 'unauthorized' });
        return;
      }
      const body = await readBody(req);
      if (!isNotification(body)) {
        writeJson(res, 400, { ok: false, error: 'invalid_payload' });
        return;
      }
      await vscode.commands.executeCommand(UI_COMMAND, body);
      writeJson(res, 202, { ok: true });
    } catch (error) {
      writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to determine router port');

  const descriptor: RouteDescriptor = {
    version: PROTOCOL_VERSION,
    instanceId,
    pid: process.pid,
    port: address.port,
    token,
    workspaceFolders: workspaceFolders(),
    workspaceName: vscode.workspace.name,
    remoteName: vscode.env.remoteName,
    createdAt: new Date().toISOString()
  };

  routeFile = path.join(dir, `${instanceId}.json`);
  fs.writeFileSync(routeFile, JSON.stringify(descriptor, null, 2), { mode: 0o600 });

  context.subscriptions.push(
    vscode.commands.registerCommand('unifyNotifier.router.status', () => {
      vscode.window.showInformationMessage(
        `Unify Notifier router: 127.0.0.1:${descriptor.port} · ${descriptor.remoteName ?? 'local'} · ${descriptor.workspaceName ?? 'workspace'} · CLI ${cliShim}`
      );
    }),
    vscode.commands.registerCommand('unifyNotifier.configureAgents', configureAgents),
    vscode.commands.registerCommand('unifyNotifier.removeAgentHooks', removeAgents),
    vscode.commands.registerCommand('unifyNotifier.testEndToEnd', testEndToEnd)
  );
}

export async function deactivate(): Promise<void> {
  if (routeFile) {
    try { fs.unlinkSync(routeFile); } catch {}
  }
  if (server) {
    await new Promise<void>(resolve => server!.close(() => resolve()));
  }
}
