import { afterEach, describe, expect, it } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import WebServer from '@deepseek-ai/dsh-host-webserver';
import BetterDeepSeekBridgeService from '../lib/index.js';
let ctx;
afterEach(async () => { if (ctx !== undefined) { await ctx.fiber.dispose(); ctx = undefined; } });
describe('BetterDeepSeekBridgeService', () => {
  it('registers versioned ping endpoint and CORS headers', async () => {
    ctx = new Context();
    await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 });
    await ctx.plugin(BetterDeepSeekBridgeService, { enableCors: true });
    const res = await fetch(`http://127.0.0.1:${String(ctx.webServer.port)}/api/better-deepseek/ping`);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(await res.json()).toMatchObject({ active: true, version: '0.2.1-rc.2' });
  });
  it('returns a 204 response for CORS preflight', async () => {
    ctx = new Context();
    await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 });
    await ctx.plugin(BetterDeepSeekBridgeService, { enableCors: true });
    const res = await fetch(`http://127.0.0.1:${String(ctx.webServer.port)}/api/better-deepseek/ping`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
  });
})
