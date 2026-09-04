# Architecture

## Why two VS Code extensions?

VS Code Remote Development can run extensions in separate extension hosts. A UI extension runs on the user's desktop, while a workspace extension runs next to the remote workspace. A single extension ID is placed in one host, so Unify Notifier uses two cooperating extensions.

```text
remote/local agent hook
        |
        v
unify-notifier CLI
        |
        | localhost HTTP + per-instance token
        v
Workspace Router extension
        |
        | vscode.commands.executeCommand(...)
        v
Local UI extension
        |
        v
native OS notification / VS Code toast
```

VS Code routes contributed commands across extension-host boundaries. This allows the workspace router to call a command registered by the local UI extension without opening an extra public network port.

## Multi-window routing

Each active workspace router writes a descriptor into `~/.unify-notifier/routes/`. The CLI selects the descriptor whose workspace folder is the longest prefix of the hook's current working directory. This lets multiple VS Code windows connected to the same remote machine coexist.

## Security baseline

- router binds only to `127.0.0.1`
- random 192-bit bearer token per router instance
- descriptor directory mode `0700`
- descriptor file mode `0600`
- request body limited to 64 KiB
- no arbitrary command execution in the notification payload
