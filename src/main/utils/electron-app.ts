/**
 * utils/electron-app.ts — app 对象的守卫式访问（主进程可用；utilityProcess 无 app）
 *
 * AgentWorker（utilityProcess）是纯 Node 上下文——`electron` 模块只导出 parentPort，
 * 不提供 app 对象。但 assembleAgentLoop 装配链里有若干构造器/资源解析会调
 * `app.getPath('userData')` 等（ToolCenter/ProviderCenter/WebProvider/AudioToolProvider/资源目录）。
 *
 * 主进程：正常走 app.getPath 返回真实目录（行为零变化）。
 * worker：app 未定义 → 回落 process.env.TINKERDESK_USER_DATA（主进程 spawn 时注入）。
 */
import { app } from 'electron'

/** app 对象是否可用（主进程 true；utilityProcess 下 electron 不导出 app → false） */
function hasApp(): boolean {
  return typeof app !== 'undefined' && typeof app.getPath === 'function'
}

/** 用户数据目录（worker 回落 TINKERDESK_USER_DATA 环境变量） */
export function getAppUserDataPath(): string {
  if (hasApp()) {
    return app.getPath('userData')
  }
  return process.env.TINKERDESK_USER_DATA ?? ''
}

/** 临时目录（worker 回落系统 TMP 环境变量） */
export function getAppTempPath(): string {
  if (hasApp()) {
    return app.getPath('temp')
  }
  return process.env.TMPDIR ?? process.env.TEMP ?? ''
}

/** 应用根目录（getAppPath——worker 回落 userData） */
export function getAppRootPath(): string {
  if (typeof app !== 'undefined' && typeof app.getAppPath === 'function') {
    return app.getAppPath()
  }
  return getAppUserDataPath()
}
