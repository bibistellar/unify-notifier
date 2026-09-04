import * as vscode from 'vscode';
const notifier: { notify(options: Record<string, unknown>): void } = require('node-notifier');
import { AgentNotification, PROTOCOL_VERSION } from '@unify-notifier/protocol';
const UI_COMMAND = 'unifyNotifier.ui.notify';
function label(agent: string): string { const cleaned=agent.trim(); return cleaned ? cleaned[0].toUpperCase()+cleaned.slice(1) : 'Agent'; }
function defaultTitle(event: AgentNotification['event']): string { if(event==='completed')return'Task completed'; if(event==='approval')return'Approval required'; if(event==='input-required')return'Input required'; if(event==='failed')return'Agent failed'; return'Agent update'; }
function shouldUseNative(config: vscode.WorkspaceConfiguration): boolean { if(!config.get<boolean>('nativeNotifications',true))return false; if(config.get<boolean>('notifyWhenFocused',false))return true; return !vscode.window.state.focused; }
async function deliver(event: AgentNotification): Promise<void> {
  if(!event || event.version!==PROTOCOL_VERSION)return; const config=vscode.workspace.getConfiguration('unifyNotifier'); const title=`${label(event.agent)} · ${event.title||defaultTitle(event.event)}`; const message=event.message||event.cwd||'Agent needs your attention.';
  if(shouldUseNative(config)) notifier.notify({title,message,sound:event.event==='approval'||event.event==='failed',wait:false});
  if(config.get<boolean>('vscodeToasts',false)||vscode.window.state.focused){ if(event.event==='failed')await vscode.window.showErrorMessage(`${title}: ${message}`); else if(event.event==='approval'||event.event==='input-required')await vscode.window.showWarningMessage(`${title}: ${message}`); else await vscode.window.showInformationMessage(`${title}: ${message}`); }
}
export function activate(context: vscode.ExtensionContext): void { context.subscriptions.push(vscode.commands.registerCommand(UI_COMMAND,deliver),vscode.commands.registerCommand('unifyNotifier.testNotification',()=>deliver({version:PROTOCOL_VERSION,agent:'unify-notifier',event:'approval',title:'Test notification',message:'Remote-to-local notification bridge is ready.',timestamp:new Date().toISOString()}))); }
export function deactivate(): void {}
