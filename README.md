# Claude Desk

Messaging-style macOS UI where each conversation is a local Claude Code session.

```sh
npm install
npm run dev     # hot reload
npm start       # build + run
```

Requires the `claude` CLI installed and logged in (`claude login`). Sessions run on this machine with your normal Claude Code config, skills, MCP servers and permissions.

Data lives in `~/.claude-desk/` (agents + transcripts). Set `CLAUDE_DESK_CLI=/path/to/claude` to override the binary.
