/**
 * tool-result.ts — Tool execution result
 *
 * ToolResult: wraps a tool execution result; drives the engine's control loop.
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
