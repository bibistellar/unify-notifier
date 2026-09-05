# Agent configuration

Run **Unify Notifier: Configure Agents** from the Command Palette. The command runs in the workspace extension host, so in Remote SSH it edits the remote user's agent settings rather than the local machine's settings.

## Safety behavior

- Existing settings are parsed as JSON/JSONC and preserved.
- Existing hooks are kept; Unify Notifier appends only its own missing hook handlers.
- Re-running configuration is idempotent and does not duplicate handlers.
- Before modifying an existing settings file, Unify Notifier creates a timestamped backup next to it and preserves restrictive file permissions where supported.
- **Unify Notifier: Remove Agent Hooks** removes only handlers whose command exactly matches a Unify Notifier-managed command.
- Hook command paths are generated for the workspace OS (`.cmd` on Windows, shell shim on Unix-like hosts).

## CodeBuddy

User settings: `~/.codebuddy/settings.json`.

Configured events:

- `Stop` -> `completed`
- `StopFailure` -> `failed`
- `PermissionRequest` -> `approval`
- `Elicitation` -> `input-required`

CodeBuddy treats externally changed hook configuration as security-sensitive. Review the resulting configuration in CodeBuddy's `/hooks` panel.

## Claude Code

User settings: `~/.claude/settings.json`.

Configured events:

- `Stop` -> `completed`
- `StopFailure` -> `failed`
- `Notification(permission_prompt)` -> `approval`
- `Notification(elicitation_dialog)` -> `input-required`

`Stop` is used deliberately because the product goal is an immediate notification when the agent finishes its response and returns control to the user. Native desktop notifications are suppressed while VS Code is focused by default, so this does not produce an OS-level alert while the user is already looking at the editor.
