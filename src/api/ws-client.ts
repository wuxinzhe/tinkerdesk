/**
 * ws-client.ts — 数据层：STOMP WebSocket 客户端
 *
 * STOMP WebSocket 传输实现，使用 @stomp/stompjs 库。
 *
 * 连接时通过 CONNECT 帧的 token 头部认证。
 * 发送消息到 /app/{destination}，接收消息通过订阅 /user/queue/messages。
 *
 * 重连：由 @stomp/stompjs 内置机制完全接管，无需自定义重连调度。
 * - reconnectDelay = 2000ms（线性间隔）
 * - connectionTimeout = 8000ms（连接超时自动断开触发重连）
 * - heartbeatIncoming/Outgoing = 10000ms
 *
 * 排查手段：
 * - debug 回调输出库内全部事件日志（前缀 [STOMP]）
 * - onChangeState 监控状态变化
 * - onWebSocketClose 的 evt.code/reason 判断断线原因（1000=正常, 1006=异常断开）
 * - logRawCommunication = true 可输出原始 STOMP 帧（排查用）
 */
import type { Backend, PlatformCapabilities, BackendEvent } from '@/defines/api/backend-types'
import type { ToolDefinition } from '@/defines/tools/base-tool'
import { Client, type IFrame, type StompSubscription, ActivationState } from '@stomp/stompjs'
import { setConnectId } from './http-client'
import { InterceptionPipeline } from '@/renderer/utils/interceptors/InterceptionPipeline'
import type { OutgoingMessage } from '@/renderer/utils/interceptors/InterceptionPipeline'
import { ChunkHandler } from '@/renderer/utils/interceptors/ChunkHandler'
import { SizeLimitHandler } from '@/renderer/utils/interceptors/SizeLimitHandler'

const webCapabilities: PlatformCapabilities = {
  platformName: 'web',
  nativeFileDialog: false,
  hasTerminal: false,
  hasFileRead: false
}

/** 本地时间带时区，用于日志前缀 */
function ts(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  const offset = -d.getTimezoneOffset()
  const tzSign = offset >= 0 ? '+' : '-'
  const tzHours = pad(Math.abs(offset) / 60)
  const tzMins = pad(Math.abs(offset) % 60)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms} UTC${tzSign}${tzHours}:${tzMins}`
}

export class WebSocketClient implements Backend {
  // ── 消息拦截器管线 ──
  private pipeline = new InterceptionPipeline()
    .use('user_message', new ChunkHandler({ maxDirect: 32 * 1024, maxAllowed: 32 * 1024 }))
    .use('tool_result', new ChunkHandler({ maxDirect: 60 * 1024, maxAllowed: 512 * 1024, chunkSize: 60 * 1024 }))
    .use('approval_response', new SizeLimitHandler({ maxAllowed: 60 * 1024 }))
    .use('revoke', new SizeLimitHandler({ maxAllowed: 60 * 1024 }))
  // ── connectId（从 tools_registered 事件的 sessionId 获取）──
  // 在工具注册响应返回后设置，供 REST API 关联 WS 会话
  private clientId: string = ''
  connectId: string = ''
  private client: Client | null = null
  private eventHandlers = new Set<(event: BackendEvent) => void>()
  private url = ''
  private token = ''

  // 标记：disconnect() 主动发起时设为 true，防止重连
  private intentionalClose = false

  // 消息队列：未连接时暂存
  private pendingMessages: Array<{ destination: string; body: string; headers?: Record<string, string> }> = []

  // 重连回调（用于重新注册工具）
  private onReconnect: (() => void) | null = null

  // 已注册的工具定义缓存（断线重连后自动重发）
  private cachedBuiltin: ToolDefinition[] = []
  private cachedExtensions: ToolDefinition[] = []

  // 订阅对象
  private subscription: StompSubscription | null = null
  /** 防重入标志：doConnect 已在执行中 */
  private connecting = false

  // ── 内部事件分发 ──

  private emit(event: BackendEvent): void {
    this.eventHandlers.forEach(handler => handler(event))
  }

  // ── 外部事件注册 ──

  onMessage(cb: (msg: unknown) => void): void {
    this.eventHandlers.add((event) => {
      if (event.type === 'message') {
        cb(event.data)
      }
    })
  }

  /** 监听后端生命周期事件 */
  onEvent(cb: (event: BackendEvent) => void): void {
    this.eventHandlers.add((event) => {
      if (event.type !== 'message') {
        cb(event)
      }
    })
  }

  // ── 连接 / 断开 ──

  async connect(url: string): Promise<void> {
    // 相对路径补全为绝对路径
    if (url.startsWith('/')) {
      url = `${window.location.protocol}//${window.location.host}${url}`
    }
    // 从 URL 提取 token 参数（旧格式兼容）和实际端点
    const parsedUrl = new URL(url)
    this.token = parsedUrl.searchParams.get('token') || ''
    const stompUrl = url.includes('?') ? url.substring(0, url.indexOf('?')) : url
    // 去除协议前缀统一为 ws://
    this.url = stompUrl.replace(/^http/, 'ws')

    console.log(`[${ts()}] [STOMP] connect url=${this.url.replace(/\/\/.*@/, '//***@')}`)
    this.intentionalClose = false
    this.pendingMessages = []

    return this.doConnect()
  }

  async disconnect(): Promise<void> {
    console.log(`[${ts()}] [STOMP] disconnect intentional=true`)
    this.intentionalClose = true
    this.connecting = false
    this.subscription = null
    if (this.client) {
      await this.client.deactivate()
      this.client = null
    }
    this.pendingMessages = []
    this.cachedBuiltin = []
    this.cachedExtensions = []
    this.eventHandlers.clear()
  }

  private async doConnect(): Promise<void> {
    if (this.connecting) {
      console.log(`[${ts()}] [STOMP] doConnect skipped (already connecting)`)
      return
    }
    this.connecting = true
    this._pendingResolve = null
    this._pendingReject = null

    // 安全清理旧客户端（await 确保旧 session 完全关闭后再新建）
    if (this.client) {
      await this.client.deactivate()
      this.client = null
    }

    return new Promise((resolve, reject) => {
      this._pendingResolve = resolve
      this._pendingReject = reject

      console.log(`[${ts()}] [STOMP] creating new Client`)
      const connectTimeout = setTimeout(() => {
        this.connecting = false
        console.warn(`[${ts()}] [STOMP] connection timeout`)
        reject(new Error('STOMP 连接超时'))
      }, 20_000)

      this.client = new Client({
        brokerURL: this.url,
        connectHeaders: {
          token: this.token
        },
        heartbeatIncoming: 10000,
        heartbeatOutgoing: 10000,
        reconnectDelay: 2000,
        connectionTimeout: 8000,
        // ⚠️ 不打印 debug：stompjs 对每个帧（含流式每 chunk）都回调，日志会爆炸。
        // 关键事件走 onConnect/onChangeState/onStompError/onWebSocketClose 打印。
        debug: () => {},
        onChangeState: (state) => {
          console.log(`[${ts()}] [STOMP] state=${ActivationState[state]} (${state})`)
        },
        onConnect: (frame) => {
          clearTimeout(connectTimeout)
          this.connecting = false
          this.emit({ type: 'connected' })
          console.log(`[${ts()}] [STOMP] connected session=${frame.headers?.['session'] || '?'}`)

          // 订阅统一消息队列
          this.subscription = this.client!.subscribe('/user/queue/messages', (message) => {
            try {
              const msg = JSON.parse(message.body)

              // 心跳回应，不向上传递
              if (msg.event === 'pong') {
                return
              }

              // tools_registered 事件携带 sessionId（即 connectId）
              if (msg.payload?.type === 'tools_registered' && msg.sessionId) {
                this.connectId = msg.sessionId
                setConnectId(this.connectId)
              }

              this.emit({ type: 'message', data: msg })
            } catch (e) {
              console.warn(`[${ts()}] [STOMP] Message parse error:`, e)
            }
          })

          // 重连后发送所有排队的消息
          this.flushPending()

          // 自动重新注册工具（首次连接 + 断线重连均触发）
          if (this.cachedBuiltin.length > 0 || this.cachedExtensions.length > 0) {
            this.sendRegisterTools(this.cachedBuiltin, this.cachedExtensions)
          }

          // 触发重连回调
          this.onReconnect?.()

          if (this._pendingResolve) {
            this._pendingResolve()
            this._pendingResolve = null
            this._pendingReject = null
          }
          resolve()
        },
        onStompError: (frame: IFrame) => {
          clearTimeout(connectTimeout)
          this.connecting = false
          console.warn(`[${ts()}] [STOMP] Broker error: ${frame.headers['message']}`)
          this.emit({ type: 'error', error: frame.headers['message'] || 'STOMP 协议错误' })
          if (this._pendingReject) {
            this._pendingReject(new Error(frame.headers['message'] || 'STOMP 连接失败'))
            this._pendingResolve = null
            this._pendingReject = null
          }
        },
        onWebSocketClose: (evt) => {
          clearTimeout(connectTimeout)
          this.connecting = false
          console.log(`[${ts()}] [STOMP] closed code=${evt.code} reason=${evt.reason || 'none'} intentional=${this.intentionalClose}`)
          this.emit({ type: 'disconnected' })

          if (this.intentionalClose) return

          if (this._pendingReject) {
            this._pendingReject(new Error('WebSocket 连接失败'))
            this._pendingResolve = null
            this._pendingReject = null
          }
          // 库内部 _schedule_reconnect() 会在用户回调之后自动执行（如果 active 为 true）
        }
      })

      this.client.activate()
    })
  }

  // ── Promise 控制（首次连接）──

  private _pendingResolve: (() => void) | null = null
  private _pendingReject: ((err: unknown) => void) | null = null

  // ── UUID 生成（兼容非安全上下文） ──

  /** 使用 crypto.getRandomValues 生成 UUID v4，兼容所有上下文（含 http://IP 等非安全上下文） */
  private static generateUUID(): string {
    // crypto.randomUUID() 只在安全上下文可用（HTTPS/localhost）
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
    // 兜底：crypto.getRandomValues 在所有上下文都可用
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40  // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80  // variant 1
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
  }

  // ── 消息发送（含拦截器管线）──

  send(msg: unknown): void {
    const parsed = msg as Record<string, unknown>
    const type = parsed?.type as string | undefined

    // chunk 消息（已经过分片的）直通，不再过管线
    if (type === 'chunk') {
      this.doPublish(parsed)
      return
    }

    const clientMessageId = WebSocketClient.generateUUID()
    const enriched = { ...parsed, clientMessageId }

    this.pipeline.intercept(enriched as OutgoingMessage, (finalMsg) => {
      this.doPublish(finalMsg)
    })
  }

  /** 执行实际的 STOMP publish */
  private doPublish(msg: Record<string, unknown>): void {
    const type = (msg.type as string) ?? ''
    const destination = this.typeToDestination(type)
    const body = JSON.stringify(msg)

    // clientMessageId 也作为 STOMP native header 发送，不依赖 body 解析
    const stompHeaders: Record<string, string> = {}
    const clientMsgId = msg.clientMessageId as string | undefined
    if (clientMsgId) {
      stompHeaders['clientMessageId'] = clientMsgId
    }

    if (this.client?.connected) {
      this.client.publish({
        destination,
        headers: stompHeaders,
        body
      })
    } else {
      this.pendingMessages.push({ destination, body, headers: stompHeaders })
    }
  }

  /** 将旧协议 type 映射到 STOMP 目的地。 */
  private typeToDestination(type: string): string {
    const map: Record<string, string> = {
      'register_tools': '/app/tools/register',
      'user_message': '/app/user/message',
      'ping': '/app/ping',
      'tool_result': '/app/tool/result',
      'approval_response': '/app/approval/response',
      'stop': '/app/stop',
      'revoke': '/app/revoke',
      'env_register': '/app/client/env/register'
    }
    return map[type] || '/app/' + type.replace(/_/g, '/')
  }

  /** 重连成功后发送所有排队的消息。 */
  private flushPending(): void {
    if (this.pendingMessages.length === 0) return
    const msgs = this.pendingMessages.splice(0)
    for (const msg of msgs) {
      if (this.client?.connected) {
        this.client.publish({
          destination: msg.destination,
          headers: msg.headers,
          body: msg.body
        })
      }
    }
  }

  // ── 工具注册（快捷方法）──

  setOnReconnect(cb: () => void): void {
    this.onReconnect = cb
  }

  setOnReconnectFailed(_cb: (error: string) => void): void {
    // @stomp/stompjs 内置了无限重连（指数退避），无需自定义重连失败回调。
    // 保留此方法保持接口兼容，但不做实现。
  }

  registerTools(builtin: ToolDefinition[], extensions: ToolDefinition[]): void {
    // 缓存定义，断线重连后自动重发
    this.cachedBuiltin = builtin
    this.cachedExtensions = extensions
    this.sendRegisterTools(builtin, extensions)
  }

  private sendRegisterTools(builtin: ToolDefinition[], extensions: ToolDefinition[]): void {
    const mapTool = (t: ToolDefinition): Record<string, unknown> => {
      return {
        name: t.schema.function.name,
        description: t.schema.function.description,
        parameters: t.schema.function.parameters,
        toolType: t.schema.toolType || (t as any).toolType || 'web'
      }
    }

    const tools = [
      ...builtin.map(t => ({ ...mapTool(t), source: 'builtin' })),
      ...extensions.map(t => ({ ...mapTool(t), source: 'mcp' }))
    ]
    this.send({ type: 'register_tools', tools })
  }

  /** 执行工具（Web 端无法执行本地工具，必须由服务端中转）。 */
  async executeTool(_toolId: string, _params: unknown): Promise<unknown> {
    throw new Error('Web backend does not support direct tool execution; use server proxy')
  }

  /** 获取平台能力。 */
  getCapabilities(): PlatformCapabilities {
    return webCapabilities
  }
}
