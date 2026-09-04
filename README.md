# Unify Notifier

Unified desktop notifications for AI coding agents in VS Code, including Remote SSH workspaces.

## Goal

Instead of installing a different notifier for every coding agent, Unify Notifier normalizes common lifecycle events and forwards them to the local VS Code client:

- task completed
- approval required
- input required
- agent failed
- informational update

Initial adapters target CodeBuddy and Claude Code. Codex completion can be integrated today; approval-hook support is tracked separately because Codex does not currently expose the same external lifecycle hook for approval requests.

## Architecture

```text
CodeBuddy / Claude / Codex / future agents
                 |
            adapter hook
                 |
        unify-notifier CLI
                 |
       127.0.0.1 router API
                 |
     Workspace Router Extension
                 |
       VS Code command bridge
                 |
        Local UI Extension
                 |
       macOS / Windows / Linux
           native notification
```

The split UI/router design is intentional: in a Remote SSH window, the router runs on the remote machine while the UI extension runs on the computer in front of you.

## Repository layout

```text
packages/
  protocol/        shared event schema
  cli/             hook-facing CLI
  vscode-router/   workspace/remote extension
  vscode-ui/       local UI extension
  vscode-pack/     Marketplace extension pack
adapters/
  codebuddy/
  claude/
  codex/
docs/
```

## Current status

The v0.1 scaffold includes a workspace router, a local UI endpoint, a generic normalized event protocol, a stable `~/.unify-notifier/bin/unify-notifier` shim installed by the router, and initial CodeBuddy/Claude hook definitions. Automated safe merge/install of agent hook settings is the next step.

## Development

```bash
npm install
npm run build
```

For Remote SSH testing, verify extension placement with `Developer: Show Running Extensions`:

- `Unify Notifier UI` should run locally.
- `Unify Notifier Router` should run in the workspace/remote extension host.

## License

MIT
