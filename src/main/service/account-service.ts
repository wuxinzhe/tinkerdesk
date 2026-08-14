/**
 * account-service.ts — 账号初始化服务（4 步向导版）
 *
 * AccountService (local single-user):
 * - checkInitStatus: 4 checks
 *   ① default Agent exists (is_default=1)
 *   ② default Agent has a full AgentConfig row
 *   ③ 至少一个含 API Key 的模型
 *   ④ 默认 Agent 绑定了主聊天场景模型
 * - initialize 拆 4 步（initStep1~4），每步对应一个表单保存接口
 */
import { SCENE_CHAT } from '../core/llm/types'
import type { AgentConfigService } from './agent-config-service'
import type { AgentService } from './agent-service'
import type { SceneModelService } from './scene-model-service'
import type { UserCustomModelService } from './user-custom-model-service'
import type { AgentInfoDTO, CheckItemDTO, InitRequestDTO, InitStatusResponseDTO, StepStatusDTO } from './types'

/** 账号初始化服务 */
export class AccountService {
  constructor(
    private readonly agentService: AgentService,
    private readonly agentConfigService: AgentConfigService,
    private readonly customModelService: UserCustomModelService,
    private readonly sceneModelService: SceneModelService
  ) { }

  /** 4 项初始化检查（顺序即向导步骤） */
  checkInitStatus(profile: string): InitStatusResponseDTO {
    const checks: CheckItemDTO[] = [
      this.checkDefaultAgent(),
      this.checkAgentConfig(),
      this.checkProviderToken(profile),
      this.checkSceneConfig(profile),
    ]
    const initialized = checks.every((c) => c.passed)
    return { initialized, checks }
  }

  // ── Step 1：默认 Agent ──

  /** 创建默认 Agent（is_default=1，写 agent_configs 预设），已存在返回 null */
  initStep1(profile: string, request: { displayName?: string }): AgentInfoDTO | null {
    return this.agentService.create({
      profile,
      displayName: request.displayName || undefined,
      description: '主 Agent',
      isDefault: true,
    })
  }

  /** ① Agents 表是否有设置默认的 Agent（is_default=1 且唯一） */
  private checkDefaultAgent(): CheckItemDTO {
    const exists = this.agentService.findDefaultAgent() != null
    return {
      key: 'default_agent',
      label: '已创建默认 Agent',
      passed: exists,
      detail: exists ? '默认 Agent 已创建' : '未创建默认 Agent',
    }
  }

  // ── Step 2：AgentConfig 完整配置 ──

  /** 写入默认 Agent 的 AgentConfig（合并保存：partial > existing > defaults，避免覆盖已有值） */
  initStep2(profile: string, config?: Record<string, unknown>): void {
    const agent = this.agentService.getAgentInfo(profile)
    if (!agent) {
      throw new Error('默认 Agent 不存在，请先完成第一步')
    }
    if (config && Object.keys(config).length > 0) {
      // 表单提交模式：合并写入（只更新表单填写的字段，未填的保留已有/默认值）
      this.agentConfigService.upsert(profile, config)
    } else {
      // 无表单数据 = 一键重置为模式默认配置
      this.agentConfigService.reset(profile)
    }
  }

  /** 分步状态检查（初始化向导每步进入前调用）：configured 自动下一步；未配置返回回显数据 */
  getStepStatus(profile: string, step: number): StepStatusDTO {
    switch (step) {
      case 2: {
        const agent = this.agentService.findDefaultAgent()
        const cfg = agent ? this.agentConfigService.getOrNull(agent.profile) : null
        const missing = cfg ? this.agentConfigService.missingFields(cfg) : []
        return {
          step,
          configured: cfg != null && missing.length === 0,
          missingFields: cfg == null ? ['__no_config__'] : missing,
          existing: cfg,
        }
      }
      case 3: {
        const models = this.customModelService.list(profile)
        const hasToken = models.some((m) => m.apiKey && m.apiKey.trim() !== '')
        return {
          step,
          configured: hasToken,
          missingFields: [],
          existing: models,
        }
      }
      case 4: {
        const configured = this.sceneModelService.isMainConversationConfigured(profile)
        return {
          step,
          configured,
          missingFields: [],
          existing: null,
        }
      }
      default:
        throw new Error(`未知初始化步骤: ${step}`)
    }
  }

  /** ② 默认 Agent 是否有完整的 AgentConfig 配置（字段级：每个参数都有值） */
  private checkAgentConfig(): CheckItemDTO {
    const agent = this.agentService.findDefaultAgent()
    let missing: string[] = ['__no_agent__']
    if (agent) {
      const cfg = this.agentConfigService.getOrNull(agent.profile)
      missing = cfg ? this.agentConfigService.missingFields(cfg) : ['__no_config__']
    }
    const passed = agent != null && missing.length === 0
    return {
      key: 'agent_config',
      label: '默认 Agent 已配置完整参数',
      passed,
      detail: passed ? 'AgentConfig 配置完整' : `AgentConfig 缺失字段: ${missing.join(', ')}`,
    }
  }

  // ── Step 3：含 API Key 的模型 ──

  /** 创建含 API Key 的模型 */
  initStep3(profile: string, request: InitRequestDTO): string {
    const baseUrl = this.resolveDefaultBaseUrl(request.llmProvider, request.llmBaseUrl)
    return this.customModelService.create(profile, {
      alias: 'Default Model',
      modelName: request.llmModel,
      providerId: request.llmProvider,
      apiKey: request.llmApiKey,
      baseUrl,
      contextLimit: 128000,
      modelType: 'chat',
    })
  }

  /** ③ 是否已配置至少一个含 API Key 的模型 */
  private checkProviderToken(profile: string): CheckItemDTO {
    const models = this.customModelService.list(profile)
    const hasToken = models.some((m) => m.apiKey && m.apiKey.trim() !== '')
    return {
      key: 'provider_token',
      label: '已配置 AI 提供商 API Key',
      passed: hasToken,
      detail: hasToken ? `已配置 ${models.length} 个模型的 API Key` : '未配置任何 AI 提供商的 API Key',
    }
  }

  // ── Step 4：绑定主聊天场景 ──

  /** 绑定主聊天场景 */
  initStep4(profile: string, modelId: string): void {
    this.sceneModelService.appendBinding(profile, SCENE_CHAT, modelId)
  }

  /** ④ 默认 Agent 是否绑定了主聊天场景的模型 */
  private checkSceneConfig(profile: string): CheckItemDTO {
    const configured = this.sceneModelService.isMainConversationConfigured(profile)
    return {
      key: 'scene_model_configured',
      label: '主聊天场景已绑定模型',
      passed: configured,
      detail: configured ? '主聊天场景（main_conversation）已绑定模型' : '主聊天场景未配置模型',
    }
  }

  /** baseUrl 兜底 */
  private resolveDefaultBaseUrl(provider: string, provided?: string): string | undefined {
    if (provided && provided.trim() !== '') {
      return provided.trim()
    }
    switch (provider.toLowerCase()) {
      case 'openai':
        return 'https://api.openai.com/v1'
      case 'anthropic':
        return 'https://api.anthropic.com/v1'
      default:
        return undefined
    }
  }
}
