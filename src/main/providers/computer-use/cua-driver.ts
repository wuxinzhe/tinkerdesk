/**
 * providers/computer-use/cua-driver.ts — 内置 tool.computer_use provider：cua-driver
 *
 * cua-driver（trycua/cua 官方驱动——后台桌面自动化）：
 *   截图/鼠标/键盘/窗口控制 + typed browser。
 * 以「内置扩展」形态注册（builtin-cua-driver）——出现在扩展列表、可配置。
 *
 * 可用性语义：
 *   - 工具 check() 只看 provider 是否配置（本扩展注册即满足）
 *   - 扩展自身自检（check/getStatus）报告 cua-driver 是否安装——
 *     未安装时扩展 ready=false（列表可见不可用），执行抛错提示安装
 */
import { deriveStatus, type ProviderApi, type TinkerProvider } from '../../core/provider/types'
import { resolveCuaDriverCmd } from '../../tools/computer-use/cua-driver-client'

/** 内置扩展 manifest（id 以 builtin- 前缀标识——前端显示「内置」标记、不可卸载） */
export const CUA_DRIVER_MANIFEST = {
  id: 'builtin-cua-driver',
  name: 'CUA Driver',
  version: '1.0.0',
  apiVersion: 1,
  entry: '',
  builtin: true,
  description: '后台桌面自动化驱动（cua-driver——截图/鼠标/键盘/窗口控制）。本机安装位置：AppData\\Local\\Programs\\Cua\\cua-driver。',
  capabilities: ['computer_use'],
  systemInterfaces: [{ id: 'tool.computer_use', version: 1 }],
}

/** cua-driver 安装提示（执行时抛错引导） */
export const CUA_DRIVER_INSTALL_HINT =
  '未找到 cua-driver——请安装（PowerShell: irm https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.ps1 | iex）'

/** 内置扩展：cua-driver provider */
export const cuaDriverProvider: TinkerProvider = {
  init(): ProviderApi {
    return {
      /** 自检：cua-driver 是否安装（PATH + 官方安装位置） */
      check() {
        const ok = resolveCuaDriverCmd() !== null
        return {
          ok,
          checks: [{ name: 'cua-driver 安装', ok, hint: ok ? '' : CUA_DRIVER_INSTALL_HINT }],
        }
      },
      getStatus() {
        const ready = resolveCuaDriverCmd() !== null
        return { loaded: true, enabled: true, started: ready, status: deriveStatus({ loaded: true, enabled: true, started: ready }) }
      },
    }
  },
}
