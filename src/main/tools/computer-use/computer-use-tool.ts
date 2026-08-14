/**
 * computer-use-tool.ts — computer_use 工具（computer_use——功能 1:1）
 *
 * Desktop background control (cua-driver — macOS/Windows/Linux):
 *   截图（capture：som/vision/ax）、鼠标（click 系列/drag/scroll）、键盘（type/key/set_value）、
 *   窗口（list_apps/list_windows/focus_app）、wait、typed browser（cua_browser_* 8 个）。
 *
 * 安全模型（1:1）：
 *   - capture/wait/list 系列/cua_browser_state 免费
 *   - 其余 action 经门检层审批（ToolAuthService 按 action 判定——见 tool-auth-service）
 *   - 硬封锁：危险按键组合（清废纸篓/锁屏/登出等）+ 危险文本模式（curl|bash/sudo rm -rf/fork bomb）
 *
 * 审批接入：工具内部只做硬封锁门检（返回错误）；ASK 类由 ToolCallExecutor 门检链
 * （ToolAuthService.check → ApprovalManager.requestApproval）处理。
 */
import { CuaDriverClient, CuaDriverUnavailableError } from './cua-driver-client'
import type { ComputerUseProvider } from '../../service/computer-use-provider'
import type { McpCallResult } from '../../core/tool/types'
import {
  COMPUTER_USE_ACTIONS, COMPUTER_USE_BLOCKED_KEY_COMBOS,
  canonKeyCombo, blockedTypePattern,
  type ComputerUseAction,
} from './schema'
import { BaseTool } from '../base-tool'
import type { ToolContext } from '../../core/loop/types'
import { ToolResult } from '../../core/tool/tool-result'
import type { PromptRenderer } from '../../core/prompt/renderer'

/** 工具名（desktop 组——与 terminal 等客户端工具一致） */
export const TOOL_NAME = 'desktop_tinker_computer_use'

/** cua-driver typed browser 工具名 → 白名单字段（_dispatch） */
const BROWSER_ALLOWED_FIELDS: Record<string, string[]> = {
  browser_navigate: ['url'],
  browser_click: ['ref', 'input_route', 'x', 'y'],
  browser_type: ['ref', 'text'],
  browser_pointer: ['ref', 'destination_ref', 'input_route', 'x', 'y', 'to_x', 'to_y', 'delta_x', 'delta_y'],
  browser_dialog: ['dialog_id', 'prompt_text', 'delivery_mode'],
  browser_set_input_files: ['ref', 'files'],
  browser_download: ['ref', 'destination_root'],
}

const ACTION_TO_BROWSER_TOOL: Record<string, string> = {
  cua_browser_navigate: 'browser_navigate',
  cua_browser_click: 'browser_click',
  cua_browser_type: 'browser_type',
  cua_browser_pointer: 'browser_pointer',
  cua_browser_dialog: 'browser_dialog',
  cua_browser_set_input_files: 'browser_set_input_files',
  cua_browser_download: 'browser_download',
}

/** computer_use 工具 */
export class ComputerUseTool extends BaseTool {
  constructor(renderer: PromptRenderer, private readonly computerUseProvider?: ComputerUseProvider) {
    super(renderer, 'computer_use')
  }

  /** 可用性：provider 是否配置（插件声明 tool.computer_use 接口）——cua-driver 未安装不拦（执行时报错提示） */
  check(): boolean | Promise<boolean> {
    return !!this.computerUseProvider && this.computerUseProvider.hasConfiguredProvider()
  }

  /** 按会话获取 cua-driver 客户端（会话级隔离——由 provider 管理） */
  private getClient(sessionId: string): CuaDriverClient {
    return this.computerUseProvider!.getClient(sessionId)
  }

  /** 会话结束时释放（由 TinkerAgent dispose 链调用） */
  dispose(sessionId: string): void {
    this.computerUseProvider?.dispose(sessionId)
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const args = (ctx.toolCall.arguments ?? {}) as Record<string, unknown>
    const action = String(args.action ?? '').trim().toLowerCase() as ComputerUseAction
    if (!action || !COMPUTER_USE_ACTIONS.includes(action)) {
      return ToolResult.sync(JSON.stringify({ error: `missing or unknown action: ${action || '(empty)'}` }))
    }

    // ── 硬封锁门检（工具内双保险——门检层也做） ──
    if (action === 'type' || action === 'cua_browser_type') {
      const pat = blockedTypePattern(String(args.text ?? ''))
      if (pat) {
        return ToolResult.sync(JSON.stringify({
          error: `blocked pattern in type text: ${pat}`,
          hint: 'Dangerous shell patterns cannot be typed via computer_use.',
        }))
      }
    }
    if (action === 'key') {
      const combo = canonKeyCombo(String(args.keys ?? ''))
      for (const blocked of COMPUTER_USE_BLOCKED_KEY_COMBOS) {
        if (blocked.size <= combo.size && [...blocked].every((k) => combo.has(k))) {
          return ToolResult.sync(JSON.stringify({
            error: `blocked key combo: ${[...blocked].sort()}`,
            hint: 'Destructive system shortcuts are hard-blocked.',
          }))
        }
      }
    }
    if (args.bring_to_front && args.delivery_mode !== 'foreground') {
      return ToolResult.sync(JSON.stringify({ error: 'bring_to_front requires delivery_mode=\'foreground\'' }))
    }

    // ── 后端（cua-driver） ──
    let client: CuaDriverClient
    try {
      client = this.getClient(ctx.sessionId)
      await client.start()
      await client.startSession()
    } catch (e) {
      return ToolResult.sync(JSON.stringify({
        error: `computer_use backend unavailable: ${(e as Error).message}`,
        hint: '安装 cua-driver：PowerShell 执行 irm https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.ps1 | iex',
      }))
    }

    try {
      const result = await this.dispatch(client, action, args)
      return ToolResult.sync(result)
    } catch (e) {
      if (e instanceof CuaDriverUnavailableError) {
        return ToolResult.sync(JSON.stringify({ error: e.message }))
      }
      return ToolResult.sync(JSON.stringify({ error: `${action} failed: ${(e as Error).message}` }))
    }
  }

  /** action 分发（_dispatch——参数组装 1:1） */
  private async dispatch(client: CuaDriverClient, action: ComputerUseAction, args: Record<string, unknown>): Promise<string> {
    const captureAfter = Boolean(args.capture_after)

    switch (action) {
      case 'capture': {
        const mode = String(args.mode ?? 'som')
        if (!['som', 'vision', 'ax'].includes(mode)) {
          return JSON.stringify({ error: `bad mode ${mode}; use som|vision|ax` })
        }
        const maxElements = this.coerceMaxElements(args.max_elements)
        // 解析目标 pid/window_id：显式传参优先；否则 list_windows 匹配 app 或取第一个窗口
        let pid = args.pid as number | undefined
        let windowId = args.window_id as number | undefined
        if (pid === undefined || windowId === undefined) {
          const windows = await this.listWindowsParsed(client)
          // 跳过 cua-driver 自身的 overlay/授权进程窗口（拒绝操作自己）
          const usable = windows.filter((w) => !/cua|agentcursor/i.test(w.name))
          const app = String(args.app ?? '')
          const target = app
            ? usable.find((w) => w.name.toLowerCase().includes(app.toLowerCase())) ?? usable[0]
            : usable[0]
          if (target) {
            pid = pid ?? target.pid
            windowId = windowId ?? target.windowId
          }
        }
        if (pid === undefined || windowId === undefined) {
          return JSON.stringify({ error: '未找到目标窗口——请先 list_windows 或传 app/pid/window_id' })
        }
        // capture → get_window_state（新驱动把截图折叠进 get_window_state；老驱动用 screenshot）
        const tool = client.hasTool('get_window_state') ? 'get_window_state' : 'screenshot'
        const res = await client.callTool(tool, { pid, window_id: windowId, mode })
        return this.captureResponse(res, maxElements)
      }
      case 'wait': {
        // wait = 纯等待（不调 cua-driver——time.sleep 实现）
        const seconds = Math.max(0, Math.min(Number(args.seconds ?? 1), 30))
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
        return JSON.stringify({ ok: true, message: `waited ${seconds}s` })
      }
      case 'list_apps': {
        const res = await client.callTool('list_apps', {})
        const apps = this.parseJsonArray(res)
        return JSON.stringify({ apps, count: apps.length })
      }
      case 'list_windows': {
        const res = await client.callTool('list_windows', {})
        const windows = this.parseJsonArray(res)
        return JSON.stringify({ windows, count: windows.length })
      }
      case 'focus_app': {
        const app = args.app
        if (!app) return JSON.stringify({ error: 'focus_app requires `app`' })
        const res = await client.callTool('launch_app', { app })
        return this.maybeFollowCapture(client, res, captureAfter)
      }
      case 'cua_browser_state': {
        const stateArgs: Record<string, unknown> = {}
        for (const k of ['pid', 'window_id', 'tab_id', 'snapshot_format', 'query', 'scope_ref', 'continuation']) {
          if (args[k] !== undefined) stateArgs[k] = args[k]
        }
        const res = await client.callTool('get_browser_state', stateArgs)
        return client.extractText(res)
      }
      case 'cua_browser_prepare': {
        const res = await client.callTool('browser_prepare', {
          pid: args.pid, window_id: args.window_id,
          profile_mode: args.profile_mode ?? 'isolated_new',
          profile_name: args.profile_name,
          allow_launch: Boolean(args.allow_launch),
        })
        return client.extractText(res)
      }
      default: {
        const browserTool = ACTION_TO_BROWSER_TOOL[action]
        if (browserTool) {
          const callArgs: Record<string, unknown> = {}
          for (const field of BROWSER_ALLOWED_FIELDS[browserTool]) {
            if (args[field] !== undefined) callArgs[field] = args[field]
          }
          if ((browserTool === 'browser_click' || browserTool === 'browser_pointer') && Array.isArray(args.coordinate) && args.coordinate.length === 2) {
            callArgs.x = args.coordinate[0]
            callArgs.y = args.coordinate[1]
          }
          if (args.browser_pointer_action !== undefined) callArgs.action = args.browser_pointer_action
          if (args.browser_dialog_action !== undefined) callArgs.action = args.browser_dialog_action
          if (args.browser_type_mode !== undefined) callArgs.mode = args.browser_type_mode
          const res = await client.callTool(browserTool, { ...callArgs, tab_id: args.tab_id })
          return client.extractText(res)
        }
        return this.dispatchInput(client, action, args, captureAfter)
      }
    }
  }

  /** 输入类 action（click 系列/drag/scroll/type/key/set_value）——_dispatch 尾部 */
  private async dispatchInput(client: CuaDriverClient, action: ComputerUseAction, args: Record<string, unknown>, captureAfter: boolean): Promise<string> {
    const deliveryMode = args.delivery_mode as string | undefined
    const bringToFront = Boolean(args.bring_to_front)
    const coord = Array.isArray(args.coordinate) && args.coordinate.length === 2 ? args.coordinate as [unknown, unknown] : null

    if (action === 'click' || action === 'double_click' || action === 'right_click' || action === 'middle_click') {
      let button = String(args.button ?? '')
      let clickCount = 1
      if (action === 'double_click') clickCount = 2
      else if (action === 'right_click') button = 'right'
      else if (action === 'middle_click') button = 'middle'
      else button = button || 'left'
      const tool = clickCount === 2 ? 'double_click' : 'click'
      const res = await client.callTool(tool, {
        button,
        element_index: args.element,
        x: coord?.[0],
        y: coord?.[1],
        modifier: args.modifiers,
        delivery_mode: deliveryMode,
        bring_to_front: bringToFront,
      })
      return this.maybeFollowCapture(client, res, captureAfter)
    }

    if (action === 'drag') {
      const hasElements = args.from_element !== undefined && args.to_element !== undefined
      const hasCoords = Array.isArray(args.from_coordinate) && Array.isArray(args.to_coordinate)
      if (!hasElements && !hasCoords) {
        return JSON.stringify({ error: 'drag requires from_coordinate/to_coordinate or from_element/to_element' })
      }
      const res = await client.callTool('drag', {
        from_element: args.from_element,
        to_element: args.to_element,
        from_xy: args.from_coordinate,
        to_xy: args.to_coordinate,
        button: args.button ?? 'left',
        modifier: args.modifiers,
        delivery_mode: deliveryMode,
        bring_to_front: bringToFront,
      })
      return this.maybeFollowCapture(client, res, captureAfter)
    }

    if (action === 'scroll') {
      const res = await client.callTool('scroll', {
        direction: args.direction ?? 'down',
        amount: Number(args.amount ?? 3),
        element_index: args.element,
        x: coord?.[0],
        y: coord?.[1],
        modifier: args.modifiers,
        delivery_mode: deliveryMode,
        bring_to_front: bringToFront,
      })
      return this.maybeFollowCapture(client, res, captureAfter)
    }

    if (action === 'type') {
      const res = await client.callTool('type_text', {
        text: String(args.text ?? ''),
        delivery_mode: deliveryMode,
        bring_to_front: bringToFront,
      })
      return this.maybeFollowCapture(client, res, captureAfter)
    }

    if (action === 'key') {
      const res = await client.callTool('hotkey', {
        keys: String(args.keys ?? ''),
        delivery_mode: deliveryMode,
        bring_to_front: bringToFront,
      })
      return this.maybeFollowCapture(client, res, captureAfter)
    }

    if (action === 'set_value') {
      if (args.value === undefined) return JSON.stringify({ error: 'set_value requires `value`' })
      const res = await client.callTool('set_value', {
        value: String(args.value),
        element_index: args.element,
      })
      return this.maybeFollowCapture(client, res, captureAfter)
    }

    return JSON.stringify({ error: `unknown action ${action}` })
  }

  /** 解析 list_windows 文本输出 → 窗口列表（name/pid/windowId）——宽松逐行解析（格式有变体） */
  private async listWindowsParsed(client: CuaDriverClient): Promise<Array<{ name: string; pid: number; windowId: number }>> {
    const res = await client.callTool('list_windows', {})
    const text = client.extractText(res)
    const out: Array<{ name: string; pid: number; windowId: number }> = []
    for (const line of text.split('\n')) {
      if (!line.includes('window_id')) continue
      const nameM = /"([^"]+)"/.exec(line)
      const pidM = /pid\s+(\d+)/.exec(line)
      const winM = /window_id:\s*(\d+)/.exec(line)
      if (!pidM || !winM) continue
      out.push({
        name: nameM ? nameM[1] : '',
        pid: Number(pidM[1]),
        windowId: Number(winM[1]),
      })
    }
    return out
  }

  // ── 结果格式化（_capture_response / _text_response） ──

  /**
   * capture 返回：AX 树文本为主（含 [N] 编号——模型可直接点击）。
   * 当前主模型无视觉——图像 base64（~400KB）不返回（会撑爆上下文）。
   * 未来接入视觉模型（supportsVision）时在此按模型能力返回 image_data_url。
   */
  private captureResponse(res: McpCallResult, _maxElements: number): string {
    const content = res.content ?? []
    const text = content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n')
    const summary = text.length > 6000 ? text.slice(0, 6000) + `\n...(AX 树截断，total ${text.length} 字符——可提高 max_elements 或传 app 缩小范围)` : text
    if (summary) return summary
    return JSON.stringify({ ok: true, message: 'capture 完成（无 AX 树——窗口可能无无障碍内容）' })
  }

  private textResponse(res: McpCallResult): string {
    return clientExtractTextSafe(res)
  }

  private maybeFollowCapture(client: CuaDriverClient, res: McpCallResult, captureAfter: boolean): Promise<string> | string {
    const base = clientExtractTextSafe(res)
    if (captureAfter) {
      return this.dispatch(client, 'capture', {})
    }
    return base
  }

  private coerceMaxElements(v: unknown): number {
    const n = Number(v)
    if (Number.isFinite(n)) return Math.min(Math.max(Math.floor(n), 1), 1000)
    return 100
  }

  /** 解析 MCP 结果的 JSON 数组（list_apps/list_windows——cua-driver 返回文本 JSON） */
  private parseJsonArray(res: McpCallResult): unknown[] {
    const text = clientExtractTextSafe(res)
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return parsed
      if (parsed && Array.isArray((parsed as { apps?: unknown[] }).apps)) return (parsed as { apps: unknown[] }).apps
      if (parsed && Array.isArray((parsed as { windows?: unknown[] }).windows)) return (parsed as { windows: unknown[] }).windows
    } catch {
      // 非 JSON 文本——返回空
    }
    return []
  }
}

/** 工具内文本提取（避免与客户端方法重名——此处直接内联实现） */
function clientExtractTextSafe(res: McpCallResult): string {
  const parts: string[] = []
  for (const c of res.content ?? []) {
    if (c.type === 'text' && c.text) parts.push(c.text)
  }
  return parts.join('\n')
}
