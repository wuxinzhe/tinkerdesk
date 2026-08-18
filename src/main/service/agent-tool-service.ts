/**
 * agent-tool-service.ts — 工具授权服务（toolManager 的管理职责）
 *
 * per-profile 工具授权/回收（落 agent_tools）+ 装配解析：
 *   resolveToolNames(profile, agentMode)：
 *     - profile 已授权（agent_tools 非空）→ 用它
 *     - 空 → 回落 AgentMode.getToolset()（defaultAgentMode 硬编码一套默认工具集）
 */
import { AgentToolRepository } from '../repository/agent-tool-repository'

export class AgentToolService {
  constructor(private readonly repo: AgentToolRepository) {}

  /** 某 profile 已授权的工具名 */
  getAuthorized(profile: string): string[] {
    return this.repo.getToolNames(profile)
  }

  /** 授权（把工具装到该 profile） */
  authorize(profile: string, toolName: string): void {
    this.repo.authorize(profile, toolName)
  }

  /** 回收（卸载该 profile 的工具）——物理删除记录 */
  revoke(profile: string, toolName: string): void {
    this.repo.revoke(profile, toolName)
  }

  /**
   * 装配 toolNameSet：profile 已授权（agent_tools）优先。
   * @returns 已授权工具名数组；空（未授权任何工具）返回 null——由 ToolManager 回落 profile 默认工具集。
   */
  resolveToolNames(profile: string): string[] | null {
    const authorized = this.repo.getToolNames(profile)
    return authorized.length > 0 ? authorized : null
  }
}
