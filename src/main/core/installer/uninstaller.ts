/**
 * core/installer/uninstaller.ts — 卸载器（品类无关基建——与安装器对称）
 *
 * 卸载 = 删除安装产物（目录/依赖/资源全部在 installDir 内——一次 rmSync 全清）。
 * 反注册/内存缓存清理由各 center 自己做（center 委托本卸载器执行文件系统删除）。
 */

import { existsSync, rmSync } from 'fs'

/** 卸载器（每 center 一个实例——删除安装目录——幂等容错） */
export class Uninstaller {
  /**
   * 删除安装目录（不可逆——调用方（center）确认后调用）
   * 目录不存在 = 幂等成功（不抛错）
   */
  remove(installDir: string): void {
    if (!installDir) return
    if (existsSync(installDir)) {
      rmSync(installDir, { recursive: true, force: true })
    }
  }
}
