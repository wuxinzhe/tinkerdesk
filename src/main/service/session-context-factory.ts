/**
 * session-context-factory.ts — SessionContext 构建工厂
 *
 * SessionContextFactory:
 * loads all config before a conversation starts (AgentConfig + ClientEnv +
 * YOLO + sender) and produces a complete SessionContext — the single entry
 * parameter for TinkerAgent.
 *
 * 本地客户端：
 * - profile 从会话表解析
 * - yolo 从会话表读取（session.yolo）
 * - connectId 已删除（本地无连接概念）
 */
import { homedir } from 'node:os'
import type { SessionContext, SessionContextBuildOptions } from '../core/loop/types'
import type { AgentConfigService } from './agent-config-service'
import type { SessionService } from './session-service'
import type { AgentService } from './agent-service'
import type { AgentModeRegistry } from '../core/mode/agent-mode-registry'

/** 会话上下文工厂 */
export class SessionContextFactory {
  constructor(
    private readonly agentConfigService: AgentConfigService,
    private readonly sessionService: SessionService,
    private readonly agentModeRegistry: AgentModeRegistry,
    private readonly agentService: AgentService
  ) {}

  /**
   * 构建会话上下文：
   * 1. 会话存在则加载，不存在则创建（用 profile 或默认）
   * 2. profile 从会话表解析
   * 3. yolo 从会话表读取
   * 4. 读 agent 的 agent_mode_id → AgentModeRegistry 取模式 → getDefaultConfig 兜底
   * 5. 装载 AgentConfig（DB 无行时用模式的默认配置）
   * 6. 装载 ClientEnv（客户端环境探测）
   * 7. 装配 sender + 回调
   */
  build(options: SessionContextBuildOptions): SessionContext {
    // ── 1. 会话：存在则加载，不存在则创建（profile 必传） ──
    let sessionId = options.sessionId
    if (!sessionId) {
      const created = this.sessionService.create(options.profile)
      sessionId = created.id
    }
    sessionId = sessionId as string
    const sessionEntity = this.sessionService.findById(sessionId, options.profile)
    if (!sessionEntity) {
      throw new Error(`会话不存在: ${sessionId}`)
    }

    // ── 2. profile：显式传入优先；会话已存在时校验一致（防串 Agent） ──
    const profile = options.profile || sessionEntity.profile || 'default'
    if (sessionEntity.profile && sessionEntity.profile !== profile) {
      throw new Error(`会话 ${sessionId} 属于 Agent(${sessionEntity.profile})，与请求的 Agent(${profile}) 不一致`)
    }

    // ── 3. yolo：从会话表读取 ──
    const yolo = sessionEntity.yolo

    // ── 4. Agent Mode：读 agent 的 mode 引用 → registry 取模式 ──
    const agent = this.agentService.getAgentInfo(profile)
    const agentModeId = agent?.agentModeId || 'default'
    const agentModeVersion = agent?.agentModeVersion || '1.0'
    const agentMode = this.agentModeRegistry.getAgentMode(agentModeId) ?? this.agentModeRegistry.getAgentMode('default')

    // ── 5. Agent 运行参数（配置缺失即报错——不静默兜底，异常可见） ──
    const agentConfig = this.agentConfigService.get(profile)

    // ── 6. 客户端环境 ──
    const isWin = process.platform === 'win32'
    const clientEnv: SessionContext['clientEnv'] = {
      //  描述串（'Windows' 开头）——runtime-environment 模块的
      // osStartsWith('windows') 标志位依赖这个前缀（'win32' 会导致 isWindowsMsys 失效）
      os: isWin ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux',
      arch: process.arch,
      clientType: 'desktop',
      // tinkerdesk 的 terminal 工具实际走 git-bash/MSYS（非 cmd.exe）——如实告知 LLM
      shell: 'bash',
      homeDir: homedir(),
      pathFormat: isWin ? 'msys' : 'unix',
    }

    // ── 7. 装配完整上下文 ──
    const sender = options.sender
    return {
      sessionId,
      profile,
      yolo,
      agentConfig,
      agentModeId,
      agentModeVersion,
      agentMode: agentMode ?? undefined,
      clientEnv,
      sender,
      sendTips: (eventType, content) => sender.sendTips(sessionId, eventType, content),
      sendAction: (eventType, payload) => sender.sendAction(sessionId, eventType, payload),
      sendMessage: (eventType, payload) => sender.sendMessage(sessionId, eventType, payload),
      sendSession: (eventType, payload) => sender.sendSession(sessionId, eventType, payload),
      sendError: (eventType, message) => sender.sendError(sessionId, eventType, message),
      sendToken: (chunk) => sender.sendToken(sessionId, chunk),
      sendApprovalRequest: (data) => sender.sendApprovalRequest(sessionId, data),
    }
  }

  /**
   * 构建子代理上下文（delegate 用）：复用 build 的完整配置装载，
   * 附加 ephemeralSystemPrompt（覆盖 system prompt——不走 DB 缓存）+ delegateDepth。
   * 会话必须已存在（delegate 工具先 create 子会话）。
   */
  buildEphemeral(options: SessionContextBuildOptions & { systemPrompt: string; delegateDepth?: number }): SessionContext {
    const ctx = this.build(options)
    ctx.ephemeralSystemPrompt = options.systemPrompt
    ctx.delegateDepth = options.delegateDepth ?? 0
    return ctx
  }
}
