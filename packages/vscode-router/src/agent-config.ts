import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser';

export type AgentId = 'codebuddy' | 'claude';

interface HookHandler {
  type?: string;
  command?: string;
  [key: string]: unknown;
}

interface HookGroup {
  matcher?: string;
  hooks: HookHandler[];
  [key: string]: unknown;
}

type HookMap = Record<string, HookGroup[]>;

interface AgentSpec {
  id: AgentId;
  label: string;
  settingsPath: string;
  binaryNames: string[];
  hooks: HookMap;
}

const CLI = '~/.unify-notifier/bin/unify-notifier';

export const AGENT_SPECS: Record<AgentId, AgentSpec> = {
  codebuddy: {
    id: 'codebuddy',
    label: 'CodeBuddy',
    settingsPath: path.join(os.homedir(), '.codebuddy', 'settings.json'),
    binaryNames: ['codebuddy'],
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: `${CLI} --agent codebuddy --event completed --stdin` }] }],
      StopFailure: [{ hooks: [{ type: 'command', command: `${CLI} --agent codebuddy --event failed --stdin` }] }],
      PermissionRequest: [{ hooks: [{ type: 'command', command: `${CLI} --agent codebuddy --event approval --stdin` }] }],
      Elicitation: [{ hooks: [{ type: 'command', command: `${CLI} --agent codebuddy --event input-required --stdin` }] }]
    }
  },
  claude: {
    id: 'claude',
    label: 'Claude Code',
    settingsPath: path.join(os.homedir(), '.claude', 'settings.json'),
    binaryNames: ['claude'],
    hooks: {
      StopFailure: [{ hooks: [{ type: 'command', command: `${CLI} --agent claude --event failed --stdin` }] }],
      Notification: [
        { matcher: 'permission_prompt', hooks: [{ type: 'command', command: `${CLI} --agent claude --event approval --stdin` }] },
        { matcher: 'idle_prompt', hooks: [{ type: 'command', command: `${CLI} --agent claude --event completed --stdin` }] },
        { matcher: 'elicitation_dialog', hooks: [{ type: 'command', command: `${CLI} --agent claude --event input-required --stdin` }] }
      ]
    }
  }
};

function commandExists(names: string[]): boolean {
  const pathEntries = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];
  return names.some(name => pathEntries.some(entry => extensions.some(ext => fs.existsSync(path.join(entry, `${name}${ext}`)))));
}

export function detectAgent(id: AgentId): boolean {
  const spec = AGENT_SPECS[id];
  return commandExists(spec.binaryNames) || fs.existsSync(path.dirname(spec.settingsPath));
}

function hookCommands(group: unknown): string[] {
  if (!group || typeof group !== 'object') return [];
  const hooks = (group as { hooks?: unknown }).hooks;
  if (!Array.isArray(hooks)) return [];
  return hooks.flatMap(handler => {
    if (!handler || typeof handler !== 'object') return [];
    const command = (handler as { command?: unknown }).command;
    return typeof command === 'string' ? [command] : [];
  });
}

function cloneHooks(value: unknown): HookMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value)) as HookMap;
}

function containsCommand(groups: unknown[], command: string): boolean {
  return groups.some(group => hookCommands(group).includes(command));
}

export function mergeHookMap(existing: unknown, additions: HookMap): HookMap {
  const result = cloneHooks(existing);
  for (const [event, groups] of Object.entries(additions)) {
    const target = Array.isArray(result[event]) ? result[event] : [];
    for (const group of groups) {
      const commands = hookCommands(group);
      if (commands.every(command => !containsCommand(target, command))) {
        target.push(group);
      }
    }
    result[event] = target;
  }
  return result;
}

export function removeHookMap(existing: unknown, removals: HookMap): HookMap {
  const result = cloneHooks(existing);
  const removalCommands = new Set(Object.values(removals).flatMap(groups => groups.flatMap(hookCommands)));
  for (const [event, groups] of Object.entries(result)) {
    const kept = groups.flatMap(group => {
      const hooks = group.hooks.filter(handler =>
        typeof handler.command !== 'string' || !removalCommands.has(handler.command)
      );
      if (hooks.length === 0) return [];
      return [{ ...group, hooks }];
    });
    if (kept.length > 0) result[event] = kept;
    else delete result[event];
  }
  return result;
}

function readSettings(file: string): { text: string; parsed: Record<string, unknown> } {
  if (!fs.existsSync(file)) return { text: '{}\n', parsed: {} };
  const text = fs.readFileSync(file, 'utf8');
  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length > 0 || !value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Cannot safely edit invalid JSON/JSONC: ${file}`);
  }
  return { text, parsed: value as Record<string, unknown> };
}

function writeHooks(file: string, nextHooks: HookMap): { changed: boolean; backup?: string } {
  const { text, parsed } = readSettings(file);
  const currentHooks = parsed.hooks;
  if (JSON.stringify(currentHooks ?? {}) === JSON.stringify(nextHooks)) return { changed: false };

  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const edits = modify(text, ['hooks'], nextHooks, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol }
  });
  const updated = applyEdits(text, edits);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  let backup: string | undefined;
  if (fs.existsSync(file)) {
    backup = `${file}.unify-notifier-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(file, backup);
  }

  const temp = `${file}.unify-notifier-tmp-${process.pid}`;
  fs.writeFileSync(temp, updated, 'utf8');
  fs.renameSync(temp, file);
  return { changed: true, backup };
}

export function configureAgent(id: AgentId): { changed: boolean; file: string; backup?: string } {
  const spec = AGENT_SPECS[id];
  const { parsed } = readSettings(spec.settingsPath);
  const next = mergeHookMap(parsed.hooks, spec.hooks);
  return { ...writeHooks(spec.settingsPath, next), file: spec.settingsPath };
}

export function removeAgent(id: AgentId): { changed: boolean; file: string; backup?: string } {
  const spec = AGENT_SPECS[id];
  const { parsed } = readSettings(spec.settingsPath);
  const next = removeHookMap(parsed.hooks, spec.hooks);
  return { ...writeHooks(spec.settingsPath, next), file: spec.settingsPath };
}

export function isAgentConfigured(id: AgentId): boolean {
  const spec = AGENT_SPECS[id];
  try {
    const { parsed } = readSettings(spec.settingsPath);
    const hooks = cloneHooks(parsed.hooks);
    return Object.values(spec.hooks)
      .flatMap(groups => groups.flatMap(hookCommands))
      .every(command => Object.values(hooks).some(groups => containsCommand(groups, command)));
  } catch {
    return false;
  }
}
