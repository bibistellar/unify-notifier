export const PROTOCOL_VERSION = 1 as const;

export type NotificationEventType = 'completed' | 'approval' | 'input-required' | 'failed' | 'info';

export interface AgentNotification {
  version: typeof PROTOCOL_VERSION;
  agent: string;
  event: NotificationEventType;
  title?: string;
  message?: string;
  cwd?: string;
  sessionId?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface RouteDescriptor {
  version: typeof PROTOCOL_VERSION;
  instanceId: string;
  pid: number;
  port: number;
  token: string;
  workspaceFolders: string[];
  workspaceName?: string;
  remoteName?: string;
  createdAt: string;
}

export function isNotificationEvent(value: unknown): value is NotificationEventType {
  return typeof value === 'string' && ['completed', 'approval', 'input-required', 'failed', 'info'].includes(value);
}
