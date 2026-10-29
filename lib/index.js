import { Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { installModelSelection } from "@deepseek-ai/dsh-agent";

var BetterDeepSeekBridgeService = class extends Service {
  config;
  static inject = ["webServer", "agents"];
  static Config = z.object({ enableCors: z.boolean().default(true) });
  sseClients = new Set();
  latestAssistantTextBySession = new Map();

  constructor(ctx, config) {
    super(ctx, "betterDeepSeekBridge");
    this.config = config;
    this.ctx.effect(() => this.ctx.webServer.register({
      kind: "prefix",
      path: "/api/better-deepseek",
      handler: async (req, res) => {
        if (this.handleCors(req, res)) return;
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
        const pathname = url.pathname;

        if (pathname === "/api/better-deepseek/ping" && req.method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ active: true, version: "0.2.1-rc.2", capabilities: ["filtered_sse", "session_result", "session_create", "session_prompt", "session_cancel"] }));
          return;
        }
        if (pathname === "/api/better-deepseek/events" && req.method === "GET") {
          res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
          res.write(": connected\n\n");
          this.sseClients.add(res);
          req.on("close", () => this.sseClients.delete(res));
          res.on("error", () => this.sseClients.delete(res));
          return;
        }
        if (pathname === "/api/better-deepseek/session.result" && req.method === "GET") {
          const sessionId = url.searchParams.get("sessionId") ?? "";
          const agent = sessionId ? this.ctx.agents.get(sessionId) : void 0;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ type: "server-response", result: { ok: true, value: { sessionId, status: agent?.status ?? "idle", finalText: this.latestAssistantTextBySession.get(sessionId) ?? "" } } }));
          return;
        }
        if (req.method === "POST") {
          const body = await this.readJsonBody(req);
          const rpcId = body.rpcId ?? `bd-rpc-${Date.now()}`;
          if (pathname === "/api/better-deepseek/session.create") {
            try {
              const cwd = typeof body.payload?.cwd === "string" && body.payload.cwd.trim() ? body.payload.cwd : process.cwd();
              const sessionId = `session-${crypto.randomUUID()}`;
              this.latestAssistantTextBySession.set(sessionId, "");
              const defaultModel = this.ctx.get("agentDefaultModel");
              const selection = defaultModel ? defaultModel.currentSelection() : { provider: "deepseek-official", model: "deepseek-chat" };
              const presets = this.ctx.get("agentPresets");
              let presetId;
              if (presets) try { presetId = (await presets.resolve(void 0))?.id; } catch {}
              await this.ctx.agents.create({
                sessionId,
                meta: { cwd, ...presetId !== void 0 ? { agentPreset: presetId } : {} },
                agentOptions: { provider: selection.provider, model: selection.model },
                setup: async (agentCtx) => {
                  installModelSelection(agentCtx, { current: selection, assembled: void 0 });
                  if (presets && presetId) await presets.mount(agentCtx, presetId);
                }
              });
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ type: "server-response", rpcId, result: { ok: true, value: { sessionId } } }));
            } catch (err) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ type: "server-response", rpcId, result: { ok: false, error: { message: err?.message ?? "Failed to create session" } } }));
            }
            return;
          }
          if (pathname === "/api/better-deepseek/session.prompt") {
            const sessionId = String(body.payload?.sessionId ?? "");
            const text = typeof body.payload?.text === "string" ? body.payload.text : "";
            const agent = sessionId ? this.ctx.agents.get(sessionId) : void 0;
            if (!agent) {
              res.writeHead(404, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ type: "server-response", rpcId, result: { ok: false, error: { message: `Session "${sessionId}" not found` } } }));
              return;
            }
            agent.followup({ id: crypto.randomUUID(), role: "user", source: { kind: "user" }, content: [{ type: "text", text }] });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ type: "server-response", rpcId, result: { ok: true, value: {} } }));
            return;
          }
          if (pathname === "/api/better-deepseek/session.cancel") {
            const sessionId = String(body.payload?.sessionId ?? "");
            const agent = sessionId ? this.ctx.agents.get(sessionId) : void 0;
            if (!agent) {
              res.writeHead(404, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ type: "server-response", rpcId, result: { ok: false, error: { message: `Session "${sessionId}" not found` } } }));
              return;
            }
            agent.cancel("user-request");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ type: "server-response", rpcId, result: { ok: true, value: { canceled: true } } }));
            return;
          }
        }
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("not found");
      }
    }), "better-deepseek: gateway router");
    this.setupEventListeners();
  }

  handleCors(req, res) {
    if (this.config.enableCors !== false) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204); res.end(); return true;
    }
    return false;
  }

  async readJsonBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
  }

  setupEventListeners() {
    this.ctx.effect(() => this.ctx.on("session/event", (session, event) => {
      if (event.type === "assistant/chunk") {
        const chunk = event.data;
        const delta = chunk.text ?? chunk.delta ?? chunk.chunk?.text ?? chunk.chunk?.delta ?? "";
        if (delta) {
          this.latestAssistantTextBySession.set(session.id, (this.latestAssistantTextBySession.get(session.id) ?? "") + delta);
          this.broadcast("assistant/chunk", { sessionId: session.id, delta });
        }
      }
      if (event.type === "assistant/message") {
        const text = event.data.message?.content?.filter(c => c.type === "text").map(c => c.text ?? "").join("") ?? "";
        if (text) {
          this.latestAssistantTextBySession.set(session.id, text);
          this.broadcast("assistant/message", { sessionId: session.id, text });
        }
      }
    }), "better-deepseek: session event listener");
    this.ctx.effect(() => this.ctx.on("tools/pre-execute", (exec, next) => {
      if (exec.agent?.id !== void 0) this.broadcast("tool/call", { sessionId: exec.agent.id, tool: exec.name, args: exec.arguments });
      return next();
    }), "better-deepseek: tool pre-execute listener");
    this.ctx.effect(() => this.ctx.on("tools/post-execute", (exec, result, next) => {
      if (exec.agent?.id !== void 0) this.broadcast("tool/result", { sessionId: exec.agent.id, tool: exec.name, output: result });
      return next();
    }), "better-deepseek: tool post-execute listener");
    this.ctx.effect(() => this.ctx.on("agent/turn-stopping", payload => {
      const finalText = this.latestAssistantTextBySession.get(payload.agent.id) ?? "";
      this.broadcast("turn/complete", { sessionId: payload.agent.id, turn: payload.turn, finalText });
      this.broadcast("turn/stopping", { sessionId: payload.agent.id, turn: payload.turn });
    }), "better-deepseek: turn stopping listener");
  }

  broadcast(type, payload) {
    const data = `data: ${JSON.stringify({ type, timestamp: Date.now(), payload })}\n\n`;
    for (const client of this.sseClients) {
      try { client.write(data); } catch { this.sseClients.delete(client); }
    }
  }
};
export { BetterDeepSeekBridgeService, BetterDeepSeekBridgeService as default };
