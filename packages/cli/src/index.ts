#!/usr/bin/env node
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentNotification, NotificationEventType, RouteDescriptor } from '@unify-notifier/protocol';

const PROTOCOL_VERSION = 1 as const;

interface Args {
  agent: string;
  event: NotificationEventType;
  title?: string;
  message?: string;
  cwd?: string;
  stdin: boolean;
}

function parseArgs(argv: string[]): Args {
  const result: Args = { agent: 'generic', event: 'info', stdin: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`Missing value for ${arg}`);
      return value;
    };
    switch (arg) {
      case '--agent': result.agent = next(); break;
      case '--event': result.event = next() as NotificationEventType; break;
      case '--title': result.title = next(); break;
      case '--message': result.message = next(); break;
      case '--cwd': result.cwd = next(); break;
      case '--stdin': result.stdin = true; break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!['completed', 'approval', 'input-required', 'failed', 'info'].includes(result.event)) {
    throw new Error(`Unsupported event: ${result.event}`);
  }
  return result;
}

function printHelp(): void {
  process.stdout.write(`unify-notifier\n\n` +
    `Usage: unify-notifier --agent <name> --event <event> [options]\n\n` +
    `Events: completed, approval, input-required, failed, info\n` +
    `Options:\n` +
    `  --stdin            Read agent hook JSON from stdin\n` +
    `  --title <text>     Override title\n` +
    `  --message <text>   Override message\n` +
    `  --cwd <path>       Override workspace path\n`);
}

async function readStdin(): Promise<Record<string, unknown> | undefined> {
  if (process.stdin.isTTY) return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : undefined;
  } catch {
    return { raw: text };
  }
}

function routeDir(): string {
  return process.env.UNIFY_NOTIFIER_ROUTE_DIR || path.join(os.homedir(), '.unify-notifier', 'routes');
}

function loadRoutes(): RouteDescriptor[] {
  const dir = routeDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .flatMap(name => {
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as RouteDescriptor;
        return parsed.version === PROTOCOL_VERSION ? [parsed] : [];
      } catch {
        return [];
      }
    });
}

function normalize(p: string): string {
  return path.resolve(p).replace(/[\\/]+$/, '');
}

function selectRoute(routes: RouteDescriptor[], cwd: string): RouteDescriptor {
  if (routes.length === 0) throw new Error('No active VS Code Unify Notifier router found. Open the workspace in VS Code first.');
  const needle = normalize(cwd);
  const matches = routes.flatMap(route => route.workspaceFolders.map((folder: string) => ({ route, folder: normalize(folder) })))
    .filter(({ folder }) => needle === folder || needle.startsWith(folder + path.sep))
    .sort((a, b) => b.folder.length - a.folder.length);
  if (matches.length > 0) return matches[0].route;
  if (routes.length === 1) return routes[0];
  return routes.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}

function stringField(input: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = input?.[key];
  return typeof value === 'string' ? value : undefined;
}

function deriveMessage(event: NotificationEventType, hook: Record<string, unknown> | undefined): string {
  const direct = stringField(hook, 'message');
  if (direct) return direct;
  const tool = stringField(hook, 'tool_name');
  switch (event) {
    case 'completed': return 'Agent finished and is waiting for your next instruction.';
    case 'approval': return tool ? `Approval requested for ${tool}.` : 'Agent requires your approval.';
    case 'input-required': return 'Agent is waiting for your input.';
    case 'failed': return 'Agent stopped because of an error.';
    default: return 'Agent has an update.';
  }
}

async function post(route: RouteDescriptor, payload: AgentNotification): Promise<void> {
  const body = JSON.stringify(payload);
  await new Promise<void>((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: route.port,
      path: '/notify',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        authorization: `Bearer ${route.token}`
      },
      timeout: 1500
    }, res => {
      res.resume();
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve();
      else reject(new Error(`Router returned HTTP ${res.statusCode ?? 'unknown'}`));
    });
    req.on('timeout', () => req.destroy(new Error('Router request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const hook = args.stdin ? await readStdin() : undefined;
  const cwd = args.cwd || stringField(hook, 'cwd') || process.cwd();
  const route = selectRoute(loadRoutes(), cwd);
  const payload: AgentNotification = {
    version: PROTOCOL_VERSION,
    agent: args.agent,
    event: args.event,
    title: args.title,
    message: args.message || deriveMessage(args.event, hook),
    cwd,
    sessionId: stringField(hook, 'session_id'),
    timestamp: new Date().toISOString(),
    metadata: hook
  };
  await post(route, payload);
}

main().catch(error => {
  process.stderr.write(`[unify-notifier] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
