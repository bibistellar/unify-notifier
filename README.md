# Unify Notifier

Unified desktop notifications for AI coding agents in VS Code, designed to keep working when the agent runs in a Remote SSH, WSL, or Dev Container workspace.

## Why

Coding agents increasingly run for long periods and pause for approval or user input. Their notification implementations are fragmented, and remote agents often notify the remote OS rather than the computer in front of you.

Unify Notifier separates the remote event source from the local notification endpoint:

```text
CodeBuddy / Claude Code / future agents
                 |
              hook JSON
                 |
       unify-notifier CLI
                 |
      remote 127.0.0.1 router
                 |
       VS Code command bridge
                 |
          local UI extension
                 |
      native desktop notification
```

## Supported lifecycle events

- `completed`
- `approval`
- `input-required`
- `failed`
- `info`

## Agent support

| Agent | Completion | Approval | Input required | Failure | Automatic config |
| --- | --- | --- | --- | --- | --- |
| CodeBuddy | ✅ | ✅ | ✅ | ✅ | ✅ |
| Claude Code | ✅ | ✅ | ✅ | ✅ | ✅ |
| Codex | partial | partial | partial | partial | not yet |
| Generic hook/CLI | ✅ | ✅ | ✅ | ✅ | n/a |

CodeBuddy and Claude Code use their documented hook systems. Codex remains intentionally partial until its external approval/interaction hook surface can provide equivalent semantics.

## Development

Requires Node.js 22+.

```bash
npm install
npm run build
npm run test:smoke
npm run package:vsix
```

Generated VSIX files are written to `artifacts/`:

```text
unify-notifier-ui-0.1.0.vsix
unify-notifier-router-0.1.0.vsix
unify-notifier-0.1.0.vsix
```

For pre-Marketplace testing, install the UI and Router VSIX files directly. The top-level extension pack references their Marketplace IDs and becomes the normal one-click entry point once the components are published.

## Configure agents

From the Command Palette run:

```text
Unify Notifier: Configure Agents
```

The Router safely merges Unify Notifier handlers into the user-level settings file of the selected agent and creates a timestamped backup before changing an existing file.

To remove only Unify Notifier-managed handlers:

```text
Unify Notifier: Remove Agent Hooks
```

See [Agent configuration](docs/agent-configuration.md).

## Remote SSH validation

In a Remote SSH window:

1. Run `Developer: Show Running Extensions`.
2. Confirm **Unify Notifier UI** is Local and **Unify Notifier Router** is SSH/Workspace.
3. Run `Unify Notifier: Test End-to-End Bridge`.
4. A native notification should appear on the local desktop.

This test invokes the same remote CLI path used by agent hooks, so it exercises the complete remote-to-local route. See [Remote SSH validation](docs/remote-testing.md).

## Security model

- Router HTTP binds only to `127.0.0.1` on the workspace machine.
- Every active VS Code Router instance gets a random bearer token.
- Route descriptor files are stored under `~/.unify-notifier/routes` with restrictive permissions where supported.
- Hook configuration is additive and idempotent.
- Existing agent settings are backed up before modification.
- Removal matches exact Unify Notifier command strings and leaves unrelated hooks untouched.

## License

MIT
