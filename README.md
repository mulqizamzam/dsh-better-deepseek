# DSH Better DeepSeek Bridge

**DeepSeek Harness (DSH) plugin for connecting the [Better DeepSeek browser extension](https://github.com/EdgeTypE/better-deepseek) to DSH sessions.**

This repository is a reconciled port of [EdgeTypE/dsh-better-deepseek](https://github.com/EdgeTypE/dsh-better-deepseek), prepared for the DSH-native harness release target **0.2.1-rc.2**. It provides a local HTTP bridge and Server-Sent Events (SSE) stream so the browser extension can create a DSH agent session, submit prompts, receive progress, fetch the latest assistant response, and cancel a task.

> **Release status:** 0.2.1-rc.2 is the requested target version. This repository does not claim a published npm release unless one is explicitly linked in the Releases section.

## What it does

- Connects Better DeepSeek to DSH's Web profile.
- Creates a DSH agent session using the requested working directory.
- Sends a prompt to an existing session.
- Streams assistant and tool events over SSE.
- Returns the latest assistant text and session status.
- Cancels an active agent task.
- Supports CORS for browser-extension requests; configure it deliberately for your environment.

## Beginner's guide: install in DSH

### Requirements

- Node.js 20 or newer.
- DSH CLI installed and working.
- The DSH Web profile initialized at least once.
- The [Better DeepSeek browser extension](https://github.com/EdgeTypE/better-deepseek) if you want to use the browser integration.

### Option A — install from the DSH plugin registry

When version **0.2.1-rc.2** is published to the package registry, run:

```bash
dsh plugin --profile web add dsh-better-deepseek@0.2.1-rc.2
```

If you do not have `dsh` installed globally, run:

```bash
npx @deepseek-ai/dsh plugin --profile web add dsh-better-deepseek@0.2.1-rc.2
```

Then restart the DSH Web profile:

```bash
npx @deepseek-ai/dsh web
```

**Important:** Registry installation works only after that exact package version has been published. This repository commit by itself does not publish to npm.

### Option B — install from source (for testing/development)

1. Clone the repository:

   ```bash
   git clone https://github.com/mulqizamzam/dsh-better-deepseek.git
   cd dsh-better-deepseek
   ```

2. Inspect the package and source before installing. The package is a DSH extension and depends on DSH runtime packages; it is not a standalone Node application.
3. To test the extension inside a DSH source checkout, place/link the package in the matching extension workspace and use that checkout's documented build/test workflow. Do not assume that running `npm install` at this repository root is sufficient: the original package uses DSH workspace dependencies.

For Windows users who prefer PowerShell, the source project's installer script can be reviewed and run locally after verifying its contents. Do not pipe a remote script directly into `iex` unless you have inspected and trust the script.

## Confirm the bridge is running

After the plugin has loaded and the DSH Web server is running, open:

```text
http://127.0.0.1:PORT/api/better-deepseek/ping
```

Replace `PORT` with the port configured for your DSH Web profile. A healthy bridge should return JSON with `active: true`, a bridge version, and capability names.

## HTTP endpoints

The plugin registers these endpoints under `/api/better-deepseek`:

| Endpoint | Method | Purpose |
|---|---:|---|
| `/ping` | GET | Health check and capability handshake |
| `/events` | GET | Server-Sent Events (SSE) stream for assistant/tool events |
| `/session.create` | POST | Create an agent session with a working directory |
| `/session.prompt` | POST | Submit a prompt to an existing session |
| `/session.result` | GET | Fetch session status and latest assistant text |
| `/session.cancel` | POST | Request cancellation of an agent task |

The POST RPC routes accept JSON payloads in the bridge protocol expected by Better DeepSeek. For details, inspect the extension's integration code and the plugin implementation before building custom clients.

## Configuration

The package's DSH patch configures:

| Setting | Default | Meaning |
|---|---:|---|
| `enableCors` | `true` | Adds CORS headers so a browser extension can call the bridge |

CORS with `Access-Control-Allow-Origin: *` is convenient for local extension integration, but broad. Do not expose the DSH Web server to an untrusted network. Prefer loopback binding and review your network exposure, extension origin, and proxy configuration before enabling remote access.

## Troubleshooting

**The plugin command cannot find the package**

The version may not have been published to the package registry. Check the release/package links and use source-development setup until the version is available.

**The ping endpoint does not respond**

Confirm DSH Web is running, the plugin is installed in the `web` profile, and you used the correct local port.

**The browser extension cannot connect**

Confirm the extension is enabled, CORS is configured as expected, and the browser is calling the same host/port where DSH Web is listening. Avoid exposing the server publicly to work around a local connection problem.

**The session is not found**

A prompt or cancellation request requires the session ID returned by `session.create`. Recreate the session and use the ID from that response.

## Version

Current repository target: `0.2.1-rc.2` (release candidate). The bridge handshake reports this same target version.

## Development and validation

The upstream package includes TypeScript source, compiled JavaScript, DSH Cordis patch metadata, an installer script, and tests for the ping route, CORS preflight, and SSE endpoint. Before a release, validate package metadata, keep source and compiled output aligned, and run tests against the compatible DSH workspace/runtime. Workspace-based dependencies mean the package should be verified against the targeted DSH version rather than treated as an independent application.

## Project and attribution

- Reconciled port: [mulqizamzam/dsh-better-deepseek](https://github.com/mulqizamzam/dsh-better-deepseek)
- Upstream: [EdgeTypE/dsh-better-deepseek](https://github.com/EdgeTypE/dsh-better-deepseek)
- Browser extension: [EdgeTypE/better-deepseek](https://github.com/EdgeTypE/better-deepseek)

The port aims to preserve useful engineering behavior and integration workflow from upstream while documenting installation and release assumptions clearly. Verify the upstream license and preserve applicable notices when redistributing source.

## License

The upstream package declares MIT in its package metadata. Confirm and retain the upstream license file/notices in the reconciled port before redistributing source code.
