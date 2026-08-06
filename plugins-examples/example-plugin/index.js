/**
 * example-plugin/index.js — 插件协议验证示例（CommonJS）
 *
 * 演示契约：
 * - init(ctx) 返回 PluginApi（start/stop/dispose/getStatus/getConfigSchema）
 * - ctx.configDir / ctx.getConfig / ctx.setConfig / ctx.emit / ctx.registerIpc
 *
 * 安装：复制本目录到 %APPDATA%/tinkerdesk/plugins/example-plugin 后重启应用。
 */

module.exports = {
  init(ctx) {
    let running = false

    // 注册 IPC：renderer 调用 window.api.invoke('plugin:example-plugin:hello', { name })
    ctx.registerIpc('hello', (payload) => {
      const cfg = ctx.getConfig()
      const name = (payload && payload.name) || 'Tinker'
      return {
        message: `${cfg.greeting || '你好'}, ${name}！`,
        engine: cfg.engine || 'standard',
      }
    })

    return {
      start() {
        running = true
        console.log('[example-plugin] 已启动')
        ctx.emit('status', { running: true })
      },
      stop() {
        running = false
        console.log('[example-plugin] 已停止')
        ctx.emit('status', { running: false })
      },
      dispose() {
        console.log('[example-plugin] 已卸载')
      },
      getStatus() {
        return { loaded: true, enabled: running, detail: running ? '运行中' : '未启动' }
      },
      getConfigSchema() {
        return {
          type: 'object',
          properties: {
            greeting: {
              type: 'string',
              title: '问候语',
              placeholder: '你好',
              default: '你好',
            },
            engine: {
              type: 'select',
              title: '语气',
              options: [
                { label: '标准', value: 'standard' },
                { label: '热情', value: 'warm' },
                { label: '正式', value: 'formal' },
              ],
              default: 'standard',
            },
            repeat: {
              type: 'number',
              title: '重复次数',
              min: 1,
              max: 5,
              step: 1,
              default: 1,
            },
            uppercase: {
              type: 'boolean',
              title: '大写输出',
              default: false,
            },
            token: {
              type: 'secret',
              title: '令牌（演示脱敏）',
              placeholder: 'sk-...',
            },
          },
        }
      },
    }
  },
}
