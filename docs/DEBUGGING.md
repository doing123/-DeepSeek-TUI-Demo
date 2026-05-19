# Debugging

This project targets Node.js 22 and Next.js 16 for server-side debugging.

Reference: https://nextjs.org/docs/app/guides/debugging

## Recommended Flow

1. Use the project Node version:

```bash
nvm use
```

2. Stop any existing server on ports `3000` and `9229`.
3. Start Next with the official inspector flag and guarded debug probes:

```bash
npm run dev:inspect:break
```

The script uses `next dev --inspect=127.0.0.1:9229 --webpack`. The normal
`npm run dev` script can keep using the default Next.js dev mode, but Webpack
dev mode gives VS Code clearer server-side source maps for this learning repo.

4. In VS Code Run and Debug, select `Attach Next.js Server (9229)`.
5. Start debugging.
6. Open the workbench page and click `运行 Agent`.

Set breakpoints in files such as:

- `src/app/api/agent/route.ts`
- `src/lib/agent/deepseek.ts`
- `src/lib/agent/runner.ts`

The `dev:inspect:break` script enables two guarded debug probes:

- `src/app/api/agent/route.ts`: proves the browser request reached the real API route.
- `src/lib/agent/deepseek.ts`: proves execution reached the provider call.

## Verify The Debug Path

Run this in another terminal while `dev:inspect:break` is running:

```bash
npm run debug:check
```

The check attaches to `127.0.0.1:9229`, sends an empty `/api/agent` request that
returns `400`, and confirms the debugger pauses before any DeepSeek request is
made. A healthy output includes a source hint like:

```txt
webpack-internal:///(rsc)/./src/app/api/agent/route.ts
```

You can also inspect the active target manually:

```bash
curl http://127.0.0.1:9229/json/list
```

For Next.js 16, the target title is usually a Next server entry such as
`node_modules/next/dist/server/lib/start-server.js`.

## Why The Old Script Failed

The previous `NODE_OPTIONS='--inspect' next dev` form could make multiple Next
processes try to claim port `9229`, which produced:

```txt
Starting inspector on 127.0.0.1:9229 failed: address already in use
```

Next.js 16 exposes `next dev --inspect`, so the project now uses that CLI option
directly.

## Avoid Dependency Exception Noise

If VS Code opens files under `node_modules/next/dist/compiled/...` and shows
dependency errors, it usually means VS Code is pausing on caught dependency
exceptions. These are thrown and handled inside Next/npm dependency probing.

In VS Code's Run and Debug panel, open the Breakpoints section and turn off
`Caught Exceptions`. Keep your source breakpoints or the guarded `debugger`
statements enabled.

## Useful Commands

Check stale listeners:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:9229 -sTCP:LISTEN
```

Trigger the route without calling DeepSeek:

```bash
curl -X POST http://127.0.0.1:3000/api/agent \
  -H 'Content-Type: application/json' \
  --data '{}'
```
