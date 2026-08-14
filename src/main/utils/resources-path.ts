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
    // 1. 打包后：process.resourcesPath = 安装目录/resources（electron-builder extraResources 落点——
    //    含 npm / tool-schemas / prompts——不要用 app.getAppPath()——它返回 resources 本身）
    join(process.resourcesPath, '.'),
    // 2. dev：项目根 src/main/resources
    join(process.cwd(), 'src', 'main', 'resources'),
    // 3. 兜底：app 目录下 resources / out/main 上溯两级的 resources
    join(app.getAppPath(), 'resources'),
    join(__dirname, '..', '..', 'resources'),
  ]
  for (const c of candidates) {
    try {
      // 必须含 tool-schemas 才算有效资源目录（dev 时 process.resourcesPath
      // = electron/dist/resources——存在但无应用资源——不能命中）
      if (existsSync(c) && existsSync(join(c, 'tool-schemas'))) {
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
