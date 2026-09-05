# Agent configuration

Run **Unify Notifier: Configure Agents** from the Command Palette. The command runs in the workspace extension host, so in Remote SSH it edits the remote user's agent settings rather than the local machine's settings.

## Safety behavior

- Existing settings are parsed as JSON/JSONC and preserved.
- Existing hooks are kept; Unify Notifier appends only its own missing hook handlers.
- Re-running configuration is idempotent and does not duplicate handlers.
- Before modifying an existing settings file, Unify Notifier creates a timestamped backup next to it.
- **Unify Notifier: Remove Agent Hooks** removes only handlers whose command exactly matches a Unify Notifier-managed command.

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

- `Notification(permission_prompt)` -> `approval`
- `Notification(idle_prompt)` -> `completed`
- `Notification(elicitation_dialog)` -> `input-required`
- `StopFailure` -> `failed`

Using `Notification(idle_prompt)` instead of `Stop` avoids a completion notification after every assistant turn while following Claude Code's documented notification lifecycle.
