const INSPECT_TARGETS_URL = "http://127.0.0.1:9229/json/list";
const AGENT_ROUTE_URL = "http://127.0.0.1:3000/api/agent";
const TIMEOUT_MS = 10_000;

async function main() {
  const target = await findInspectorTarget();
  const client = new InspectorClient(target.webSocketDebuggerUrl);

  await client.open();
  await client.send("Debugger.enable");

  const paused = client.waitForPause(TIMEOUT_MS);
  const request = triggerAgentRoute();
  const event = await paused;
  const frame = event.params.callFrames[0];
  const script = await client.send("Debugger.getScriptSource", {
    scriptId: frame.location.scriptId
  });

  await client.send("Debugger.resume");
  await request;
  client.close();

  const source = frame.url || `script:${frame.location.scriptId}`;
  const sourceHint = findSourceHint(script.scriptSource);
  const line = frame.location.lineNumber + 1;
  const column = frame.location.columnNumber + 1;

  console.log(`[debug] Breakpoint probe paused at ${source}:${line}:${column}`);
  if (sourceHint) {
    console.log(`[debug] Source hint: ${sourceHint}`);
  }
  console.log("[debug] The server-side /api/agent request path is inspectable.");
}

// The probe posts an empty JSON object so the route returns 400 after resume and
// never reaches the DeepSeek provider or spends model tokens.
async function triggerAgentRoute() {
  const response = await fetch(AGENT_ROUTE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: "{}"
  });

  if (response.status !== 400) {
    throw new Error(`Expected /api/agent to return 400, got ${response.status}.`);
  }
}

function findSourceHint(source) {
  const sourceUrls = [...source.matchAll(/\/\/# sourceURL=(.+)$/gm)]
    .map((match) => match[1])
    .filter((url) => url !== "[module]");
  const sourceMapUrl = /\/\/# sourceMappingURL=(.+)$/m.exec(source);

  return sourceUrls.at(-1) || sourceMapUrl?.[1] || null;
}

async function findInspectorTarget() {
  const response = await fetch(INSPECT_TARGETS_URL);

  if (!response.ok) {
    throw new Error(
      `Could not read inspector target list from ${INSPECT_TARGETS_URL}. Start npm run dev:inspect:break first.`
    );
  }

  const targets = await response.json();
  const target = targets.find((item) => item.type === "node" && item.webSocketDebuggerUrl);

  if (!target) {
    throw new Error("No Node inspector target found on port 9229.");
  }

  return target;
}

class InspectorClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.pauseHandler = null;
  }

  open() {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.url);
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
      this.socket.addEventListener("message", (event) => {
        this.handleMessage(JSON.parse(event.data));
      });
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;

    const response = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    this.socket.send(JSON.stringify({ id, method, params }));
    return response;
  }

  waitForPause(timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pauseHandler = null;
        reject(
          new Error(
            `Timed out waiting for debugger pause. Make sure the dev server was started with npm run dev:inspect:break.`
          )
        );
      }, timeoutMs);

      this.pauseHandler = (message) => {
        clearTimeout(timeout);
        this.pauseHandler = null;
        resolve(message);
      };
    });
  }

  handleMessage(message) {
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }

      return;
    }

    if (message.method === "Debugger.paused" && this.pauseHandler) {
      this.pauseHandler(message);
    }
  }

  close() {
    this.socket.close();
  }
}

main().catch((error) => {
  console.error(`[debug] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
