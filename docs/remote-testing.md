# Remote SSH validation

Unify Notifier is split deliberately across VS Code extension hosts:

- `bibistellar.unify-notifier-ui` declares `extensionKind: ["ui"]` and `api: "none"`, so it runs on the local VS Code client and can receive commands from another extension host.
- `bibistellar.unify-notifier-router` declares `extensionKind: ["workspace"]`, so under Remote SSH it runs on the remote host beside the coding agent.
- The Router listens only on remote `127.0.0.1` with a per-instance bearer token and forwards validated events through `vscode.commands.executeCommand`.

## Full-path test

1. Install the UI and Router VSIX packages.
2. Open a folder through **Remote - SSH**.
3. Run `Developer: Show Running Extensions` and verify:
   - Unify Notifier UI — Local
   - Unify Notifier Router — SSH: <host>
4. Run **Unify Notifier: Test End-to-End Bridge**.
5. Move focus away from VS Code if `unifyNotifier.notifyWhenFocused` is `false`.
6. A native desktop notification titled `Unify-notifier · End-to-end bridge test` should arrive on the local machine.

The command intentionally invokes the same remote CLI asset that agent hooks use. The test therefore exercises:

`remote CLI -> remote loopback HTTP -> remote Router -> VS Code command bridge -> local UI -> native notification`.
