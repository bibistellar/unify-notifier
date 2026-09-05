# Codex adapter status

Codex currently exposes an external `notify` hook for agent-turn completion, while approval notifications are handled separately by the TUI notification configuration. The first Unify Notifier release therefore treats Codex as a partial adapter until an approval-request lifecycle hook is available to external commands.

Planned support:

- agent turn complete -> `completed`
- approval requested -> `approval` when an external hook becomes available
- generic/manual integration through the Unify Notifier CLI remains available
