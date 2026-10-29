import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { installModelSelection, type ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent'
import type { SessionId, UserMessage } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-tools'

declare module '@deepseek-ai/cordis' {
  interface Context {
    betterDeepSeekBridge: BetterDeepSeekBridgeService
  }
}

export interface Config {
  enableCors?: boolean
}

export class BetterDeepSeekBridgeService extends Service {
  static inject = ['webServer', 'agents']
  static Config: z<Config> = z.object({
    enableCors: z.boolean().default(true),
  })

  private readonly sseClients = new Set<ServerResponse>()
  private readonly latestAssistantTextBySession = new Map<string, string>()

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'betterDeepSeekBridge')
    this.ctx.effect(() => {
      return this.ctx.webServer.register({
        kind: 'prefix',
        path: '/api/better-deepseek',
        handler: async (req, res) => {
          if (this.handleCors(req, res)) return
          const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
          const pathname = url.pathname

          if (pathname === '/api/better-deepseek/ping' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              active: true,
              version: '0.2.1-rc.2',
              capabilities: ['filtered_sse', 'session_result', 'session_create', 'session_prompt', 'session_cancel'],
            }))
            return
          }

          if (pathname === '/api/better-deepseek/events' && req.method === 'GET') {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            })
            res.write(': connected\n\n')
            this.sseClients.add(res)
            req.on('close', () => this.sseClients.delete(res))
            res.on('error', () => this.sseClients.delete(res))
            return
          }

          if (pathname === '/api/better-deepseek/session.result' && req.method === 'GET') {
            const sessionId = url.searchParams.get('sessionId') ?? ''
            const agent = sessionId ? this.ctx.agents.get(sessionId as SessionId) : undefined
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              type: 'server-response',
              result: {
                ok: true,
                value: {
                  sessionId,
                  status: agent?.status ?? 'idle',
                  finalText: this.latestAssistantTextBySession.get(sessionId) ?? '',
                },
              },
            }))
            return
          }

          if (req.method === 'POST') {
            const body = await this.readJsonBody(req)
            const rpcId = body.rpcId ?? `bd-rpc-${Date.now()}`

            if (pathname === '/api/better-deepseek/session.create') {
              try {
                const cwd = typeof body.payload?.cwd === 'string' && body.payload.cwd.trim()
                  ? body.payload.cwd
                  : process.cwd()
                const sessionId = `session-${crypto.randomUUID()}` as SessionId
                this.latestAssistantTextBySession.set(sessionId, '')

                const defaultModel = this.ctx.get('agentDefaultModel') as { currentSelection(): { provider: string; model: string } } | undefined
                const selection = defaultModel
                  ? defaultModel.currentSelection()
                  : { provider: 'deepseek-official', model: 'deepseek-chat' }

                const presets = this.ctx.get('agentPresets') as {
                  resolve(id?: string): Promise<{ id?: string } | undefined>
                  mount(ctx: Context, id: string): Promise<void>
                } | undefined
                let presetId: string | undefined
                if (presets) {
                  try {
                    presetId = (await presets.resolve(undefined))?.id
                  } catch {
                    // A missing or invalid default preset must not block session creation.
                  }
                }

                await this.ctx.agents.create({
                  sessionId,
                  meta: {
                    cwd,
                    ...(presetId !== undefined ? { agentPreset: presetId } : {}),
                  },
                  agentOptions: { provider: selection.provider, model: selection.model },
                  setup: async (agentCtx) => {
                    const selected: ModelSelectionRef = { current: selection, assembled: undefined }
                    installModelSelection(agentCtx, selected)
                    if (presets && presetId) await presets.mount(agentCtx, presetId)
                  },
                })

                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ type: 'server-response', rpcId, result: { ok: true, value: { sessionId } } }))
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({
                  type: 'server-response',
                  rpcId,
                  result: { ok: false, error: { message: err instanceof Error ? err.message : 'Failed to create session' } },
                }))
              }
              return
            }

            if (pathname === '/api/better-deepseek/session.prompt') {
              const sessionId = String(body.payload?.sessionId ?? '') as SessionId
              const prompt = typeof body.payload?.text === 'string' ? body.payload.text : ''
              const agent = sessionId ? this.ctx.agents.get(sessionId) : undefined
              if (!agent) {
                res.writeHead(404, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({
                  type: 'server-response', rpcId,
                  result: { ok: false, error: { message: `Session "${sessionId}" not found` } },
                }))
                return
              }
              const userMsg = {
                id: crypto.randomUUID(),
                role: 'user',
                source: { kind: 'user' },
                content: [{ type: 'text', text: prompt }],
              } as unknown as UserMessage
              agent.followup(userMsg)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ type: 'server-response', rpcId, result: { ok: true, value: {} } }))
              return
            }

            if (pathname === '/api/better-deepseek/session.cancel') {
              const sessionId = String(body.payload?.sessionId ?? '') as SessionId
              const agent = sessionId ? this.ctx.agents.get(sessionId) : undefined
              if (!agent) {
                res.writeHead(404, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({
                  type: 'server-response', rpcId,
                  result: { ok: false, error: { message: `Session "${sessionId}" not found` } },
                }))
                return
              }
              agent.cancel('user-request' as never)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ type: 'server-response', rpcId, result: { ok: true, value: { canceled: true } } }))
              return
            }
          }

          res.writeHead(404, { 'Content-Type': 'text/plain' })
          res.end('not found')
        },
      })
    }, 'better-deepseek: gateway router')
    this.setupEventListeners()
  }

  private handleCors(req: IncomingMessage, res: ServerResponse): boolean {
    if (this.config.enableCors !== false) {
      // Compatibility default for browser extensions. Keep DSH bound to loopback unless an explicit trusted deployment needs otherwise.
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.setHeader('Access-Control-Max-Age', '600')
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return true
    }
    return false
  }

  private async readJsonBody(req: IncomingMessage): Promise<Record<string, any>> {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    const raw = Buffer.concat(chunks).toString('utf8')
    try {
      const parsed: unknown = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, any>
        : {}
    } catch {
      return {}
    }
  }

  private setupEventListeners(): void {
    this.ctx.effect(() => this.ctx.on('session/event', (session, event) => {
      if (event.type === 'assistant/chunk') {
        const chunk = event.data as { text?: string; delta?: string; chunk?: { text?: string; delta?: string } }
        const delta = chunk.text ?? chunk.delta ?? chunk.chunk?.text ?? chunk.chunk?.delta ?? ''
        if (delta) {
          this.latestAssistantTextBySession.set(session.id, (this.latestAssistantTextBySession.get(session.id) ?? '') + delta)
          this.broadcast('assistant/chunk', { sessionId: session.id, delta })
        }
      }
      if (event.type === 'assistant/message') {
        const data = event.data as { message?: { content?: Array<{ type: string; text?: string }> } }
        const text = data.message?.content?.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('') ?? ''
        if (text) {
          this.latestAssistantTextBySession.set(session.id, text)
          this.broadcast('assistant/message', { sessionId: session.id, text })
        }
      }
    }), 'better-deepseek: session event listener')

    this.ctx.effect(() => this.ctx.on('tools/pre-execute', (exec, next) => {
      const sessionId = exec.agent?.id
      if (sessionId !== undefined) this.broadcast('tool/call', { sessionId, tool: exec.name, args: exec.arguments })
      return next()
    }), 'better-deepseek: tool pre-execute listener')

    this.ctx.effect(() => this.ctx.on('tools/post-execute', (exec, result, next) => {
      const sessionId = exec.agent?.id
      if (sessionId !== undefined) this.broadcast('tool/result', { sessionId, tool: exec.name, output: result })
      return next()
    }), 'better-deepseek: tool post-execute listener')

    this.ctx.effect(() => this.ctx.on('agent/turn-stopping', (payload) => {
      const finalText = this.latestAssistantTextBySession.get(payload.agent.id) ?? ''
      this.broadcast('turn/complete', { sessionId: payload.agent.id, turn: payload.turn, finalText })
      this.broadcast('turn/stopping', { sessionId: payload.agent.id, turn: payload.turn })
    }), 'better-deepseek: turn stopping listener')
  }

  private broadcast(type: string, payload: unknown): void {
    const data = `data: ${JSON.stringify({ type, timestamp: Date.now(), payload })}\n\n`
    for (const client of this.sseClients) {
      try { client.write(data) } catch { this.sseClients.delete(client) }
    }
  }
}

export default BetterDeepSeekBridgeService
