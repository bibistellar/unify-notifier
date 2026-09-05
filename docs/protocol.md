# Unify Notifier protocol v1

Agents and adapters emit a normalized event:

```json
{
  "version": 1,
  "agent": "codebuddy",
  "event": "approval",
  "title": "Approval required",
  "message": "Approval requested for Bash.",
  "cwd": "/home/user/project",
  "sessionId": "abc123",
  "timestamp": "2026-09-04T00:00:00.000Z",
  "metadata": {}
}
```

Supported event values:

- `completed`
- `approval`
- `input-required`
- `failed`
- `info`
