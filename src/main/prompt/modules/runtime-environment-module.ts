/**
 * runtime-environment-module.ts — 运行时环境模块
 *
 * 复刻 showing-agent RuntimeEnvironmentModule：
 * 渲染 runtime-environment.hbs（OS/架构/客户端类型/Shell/HomeDir + 各平台标志位）。
 */
import type {PromptContext} from '../types'
import type {PromptRenderer} from '../renderer'
import {HandlebarsPresetModule} from './preset-module'

/** 客户端类型常量 */
export const CLIENT_TYPE_DESKTOP_APP = 'desktop'
export const CLIENT_TYPE_WEB = 'web'
export const CLIENT_TYPE_MOBILE_WEB = 'mobile-web'
export const CLIENT_TYPE_MINIPROGRAM = 'miniprogram'

/** 运行时环境模块 */
export class RuntimeEnvironmentModule extends HandlebarsPresetModule {
  readonly id = 'runtime-environment'
  constructor(renderer: PromptRenderer) {
    super(renderer)
  }

  override loadPrompt(ctx: PromptContext): string | null {
    const env = ctx.clientEnv
    if (!env || !env.os) {
      return null
    }
    const os = env.os
    const context: Record<string, unknown> = {
      os: this.formatOs(os),
      arch: env.arch,
      clientType: this.formatClientType(env.clientType),
      shell: env.shell,
      homeDir: env.homeDir,
      pathFormat: this.formatPathFormat(env.pathFormat),
      isWindowsMsys: this.isWindowsMsys(env),
      isWindowsNative: this.isWindowsNative(env),
      isDesktopApp: env.clientType === CLIENT_TYPE_DESKTOP_APP,
      isWeb: env.clientType === CLIENT_TYPE_WEB,
      isMobileWeb: env.clientType === CLIENT_TYPE_MOBILE_WEB,
      isMiniprogram: env.clientType === CLIENT_TYPE_MINIPROGRAM,
    }
    const result = this.renderer.render('runtime-environment', context)
    return result && result.trim() !== '' ? result : null
  }

  private formatOs(os: string): string {
    return os || ''
  }

  private formatClientType(t: string): string {
    return t || ''
  }

  private formatPathFormat(p: string): string {
    return p || ''
  }

  private isWindowsMsys(env: {os: string; shell: string}): boolean {
    return env.os.includes('Windows') && env.shell.includes('bash')
  }

  private isWindowsNative(env: {os: string; shell: string}): boolean {
    return env.os.includes('Windows') && !env.shell.includes('bash')
  }
}
