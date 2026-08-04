import type {LlmOperation} from './types'

/**
 * llm-operation-manager.ts — LLM Operation 管理器
 *
 * 对应 showing-agent LlmOperationManager：注入所有 LlmOperation 实现，
 * 按 scene 索引。支持运行时查询。
 */

export class LlmOperationManager {
  private readonly operations = new Map<string, LlmOperation>()

  constructor(operationList: LlmOperation[]) {
    for (const op of operationList) {
      if (!op.scene) {
        console.warn(`LlmOperation 实现缺少 scene，跳过: ${op.constructor?.name ?? 'unknown'}`)
        continue
      }
      const existing = this.operations.get(op.scene)
      if (existing) {
        throw new Error(`场景 '${op.scene}' 存在多个 LlmOperation 实现`)
      }
      this.operations.set(op.scene, op)
    }
  }

  /** 按场景获取对应的 Operation */
  getOperation(scene: string): LlmOperation {
    const op = this.operations.get(scene)
    if (!op) {
      throw new Error(`未注册的场景: ${scene}`)
    }
    return op
  }
}
