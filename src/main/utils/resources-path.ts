/**
 * resources-path.ts — 资源目录解析
 *
 * electron-vite 构建后 __dirname = out/main，resources 不在 out 内。
 * 统一解析策略（按顺序尝试）：
 *   1. 打包/生产：app.getAppPath()/resources（electron-builder 约定）
 *   2. dev：process.cwd()/src/main/resources（源码目录）
 *   3. 兜底：__dirname 上溯两级的 resources
 */
import {existsSync} from 'fs'
import {join} from 'path'
import {app} from 'electron'

/** 资源根目录（src/main/resources 或打包后 resources） */
export function getResourcesDir(): string {
  const candidates = [
    // 1. 打包后：app 目录下 resources（electron-builder 复制）
    join(app.getAppPath(), 'resources'),
    // 2. dev：项目根 src/main/resources
    join(process.cwd(), 'src', 'main', 'resources'),
    // 3. 兜底：out/main 上溯两级的 resources（= 项目根 resources）
    join(__dirname, '..', '..', 'resources'),
  ]
  for (const c of candidates) {
    try {
      if (existsSync(c)) {
        return c
      }
    } catch {
      // 继续尝试
    }
  }
  return candidates[1]
}

/** 拼接资源子路径（如 'tool-schemas/xxx.hbs'） */
export function resolveResource(...segments: string[]): string {
  return join(getResourcesDir(), ...segments)
}
