# aienv

[![npm version](https://img.shields.io/npm/v/aienv.svg)](https://www.npmjs.com/package/aienv)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**The missing permission layer between AI agents and your .env**

---

## The Problem

AI coding assistants (Claude Code, Cursor, Copilot) need your environment variables to run and test code. But they can see **everything**—API keys, database passwords, payment secrets.

It's all-or-nothing. Until now.

## The Solution

`aienv` gives you **per-variable access control** with 5 levels:

| Level | AI Can See | AI Can Modify | Example |
|-------|-----------|---------------|---------|
| `full` | Actual value | Yes | `NODE_ENV`, `PORT`, `DEBUG` |
| `read-only` | Actual value | No | `DATABASE_URL` |
| `placeholder` | `<VAR_NAME>` | No | `API_KEY` |
| `schema-only` | Format only | No | Complex configs |
| `hidden` | Nothing | No | `STRIPE_SECRET_KEY` |

## Quick Start

Add aienv as an MCP server to your AI tool:

```json
{
  "mcpServers": {
    "aienv": {
      "command": "npx",
      "args": ["aienv-mcp"]
    }
  }
}
```

On first use, aienv automatically:
1. Creates `.env.manifest.yaml` from your `.env.example`
2. Generates `.env.ai` (filtered view for AI)
3. Blocks direct `.env` file access

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  Your .env (secrets)                                        │
│  ├── STRIPE_SECRET_KEY=sk_live_xxx    ← hidden from AI      │
│  ├── DATABASE_URL=postgres://...       ← AI can read        │
│  └── DEBUG=true                        ← AI can read/write  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  .env.manifest.yaml (access rules)                          │
│  variables:                                                 │
│    STRIPE_SECRET_KEY: { access: hidden }                    │
│    DATABASE_URL: { access: read-only }                      │
│    DEBUG: { access: full }                                  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  .env.ai (what AI sees)                                     │
│  DEBUG=true                    # [full]                     │
│  DATABASE_URL=postgres://...   # [read-only]                │
│  # STRIPE_SECRET_KEY hidden                                 │
└─────────────────────────────────────────────────────────────┘
```

## Example Manifest

```yaml
# .env.manifest.yaml
version: 1
variables:
  NODE_ENV:
    access: full
    description: "Environment mode"

  DATABASE_URL:
    access: read-only
    description: "Database connection string"

  OPENAI_API_KEY:
    access: placeholder
    description: "OpenAI API key"

  STRIPE_SECRET_KEY:
    access: hidden
    description: "Payment processing - never expose"
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `aienv setup` | Full setup (recommended) |
| `aienv setup -i` | Interactive mode - choose access levels |
| `aienv generate` | Regenerate `.env.ai` |
| `aienv view` | Display variables with access levels |
| `aienv mcp` | Start MCP server |

## Installation

<details>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add aienv npx aienv-mcp
```

Or add to `.claude/settings.json`:
```json
{
  "mcpServers": {
    "aienv": {
      "command": "npx",
      "args": ["aienv-mcp"]
    }
  }
}
```
</details>

<details>
<summary><b>Claude Desktop</b></summary>

Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "aienv": {
      "command": "npx",
      "args": ["aienv-mcp"]
    }
  }
}
```

Config file locations:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
</details>

<details>
<summary><b>VS Code (Copilot/Continue)</b></summary>

Add to your VS Code `settings.json`:
```json
{
  "mcp.servers": {
    "aienv": {
      "command": "npx",
      "args": ["aienv-mcp"]
    }
  }
}
```
</details>

<details>
<summary><b>Cursor</b></summary>

Add to Cursor MCP settings:
```json
{
  "mcpServers": {
    "aienv": {
      "command": "npx",
      "args": ["aienv-mcp"]
    }
  }
}
```
</details>

<details>
<summary><b>Windsurf</b></summary>

Add to `~/.codeium/windsurf/mcp_config.json`:
```json
{
  "mcpServers": {
    "aienv": {
      "command": "npx",
      "args": ["aienv-mcp"]
    }
  }
}
```
</details>

<details>
<summary><b>CLI (standalone)</b></summary>

```bash
# Install globally
npm install -g aienv

# Run setup
aienv setup
```
</details>

## MCP Tools

| Tool | Description |
|------|-------------|
| `env_list` | List visible variables with access levels |
| `env_get` | Get a variable's value (respects permissions) |
| `env_set` | Set a variable (only `full` access) |
| `env_describe` | Get detailed info about a variable |

## Why aienv?

| Approach | Problem |
|----------|---------|
| **dotenvx** | Encrypts files, but AI still needs the decryption key |
| **permissions.deny** | Blocks all .env access—no granular control |
| **Just ignore .env** | AI can't run or test code that needs env vars |
| **aienv** | Per-variable access control. AI sees what you allow. |

## File Structure

```
your-project/
├── .env                  # Real secrets (gitignored)
├── .env.example          # Template for devs (committed)
├── .env.manifest.yaml    # Access rules (committed)
├── .env.ai               # AI-safe view (gitignored)
└── .claude/
    └── settings.json     # Claude Code config (committed)
```

## Security

- `.env` files are **gitignored** and blocked from AI
- `.env.manifest.yaml` contains **rules only**, not values—safe to commit
- `.env.ai` is **regenerated** from `.env` + manifest—gitignore it
- Unknown variables default to `placeholder` (fail-safe)
- Bash workarounds blocked (`cat .env`, `head .env`, etc.)

## License

MIT

---

Built for the AI coding era. Stop leaking secrets.
