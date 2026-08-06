/**
 * tool-result.ts — 工具执行结果类
 *
 * 对应 tinker-agent ToolResult：封装工具执行结果，供引擎控制循环流程。
 */

/** 工具执行结果封装（isAsync=true 表示已派发，等待回调） */
export class ToolResult {
  private constructor(
    /** 是否为异步执行 */
    readonly async: boolean,
    /** 工具执行结果字符串 */
    readonly result: string
  ) { }

  static async(): ToolResult {
    return new ToolResult(true, '')
  }

  static sync(result: string): ToolResult {
    return new ToolResult(false, result)
  }
}
