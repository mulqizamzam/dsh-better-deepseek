import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

export interface Config {
  enableCors?: boolean
}

export declare class BetterDeepSeekBridgeService extends Service {
  static inject: string[]
  static Config: z<Config>
  constructor(ctx: Context, config: Config)
}

export default BetterDeepSeekBridgeService
