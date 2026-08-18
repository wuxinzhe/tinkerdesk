/**
 * runtime-environment-module.ts — 运行时环境模块
 *
 * RuntimeEnvironmentModule:
 * Renders runtime-environment.hbs (OS/arch/client-type/Shell/HomeDir +
 * per-platform flags).
 */
import type {ConversationContext} from '../../core/prompt/types'
import type {PromptRenderer} from '../../core/prompt/renderer'
import {PromptModuleBase} from './prompt-module-base'

/** 客户端类型常量 */
export const CLIENT_TYPE_DESKTOP_APP = 'desktop'
export const CLIENT_TYPE_WEB = 'web'
export const CLIENT_TYPE_MOBILE_WEB = 'mobile-web'
export const CLIENT_TYPE_MINIPROGRAM = 'miniprogram'

/** 运行时环境模块 */
export class RuntimeEnvironmentModule extends PromptModuleBase {
  readonly id = 'runtime-environment'
  constructor(renderer: PromptRenderer) {
    super(renderer)
  }

  override loadPrompt(ctx: ConversationContext): string | null {
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

  /** os 为描述串时前缀匹配 */
  private osStartsWith(os: string, prefix: string): boolean {
    return !!os && os.toLowerCase().startsWith(prefix)
  }

  private isWindowsMsys(env: {os: string; pathFormat: string}): boolean {
    return this.osStartsWith(env.os, 'windows') && env.pathFormat === 'msys'
  }

  private isWindowsNative(env: {os: string; pathFormat: string}): boolean {
    return this.osStartsWith(env.os, 'windows') && env.pathFormat === 'native'
  }
}
