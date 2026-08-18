/**
 * core/installer/types.ts — 安装器（通用基建）类型定义
 *
 * 纯品类无关：不 import provider/tool 任何类型——manifest 结构是本包自己的
 * （kind 字段区分品类；具体品类中心各自做注册/检查）。
 */

/** 安装阶段 */
export type InstallStage = 'validate' | 'copy' | 'deps' | 'assets' | 'register'

/** 安装会话（分步状态——内存态——重启丢弃） */
export interface InstallSession {
  sessionId: string
  srcDir: string
  manifest: InstallManifest | null
  /** 复制后的安装目录（copy 阶段写入——providerDir/toolsDir 分流） */
  installDir: string
  /** 用户选择跳过的资源（dest 路径） */
  skipAssets: string[]
  stages: Record<InstallStage, 'pending' | 'running' | 'done' | 'failed'>
  error?: string
  /** npm 临时目录（startNpm 创建——copy 完成后清理） */
  tmpDir?: string
  /** 来源：npm 在线 / local 本地 */
  sourceType?: 'npm' | 'local'
  /** npm tarball 下载地址（startNpm 查询——download 步骤下载） */
  tarballUrl?: string
  /** tarball 解压后大小（registry 元数据——进度用） */
  tarballSize?: number
}

/** 安装器依赖（纯路径配置——注册/已装检查由各 center 自己做） */
export interface InstallerDeps {
  providersDir: string
  /** 工具包复制目标（kind:tool 分流——不装进扩展目录） */
  toolsDir?: string
}

/** 安装包资源依赖（模型/二进制/数据文件——URL 直链下载到 dest） */
export interface InstallAssetDep {
  name: string
  dest: string
  sizeMB: number
  url: string
  /** 可选依赖（外部引擎自带/用户自管——静态检查跳过——不提示下载） */
  optional?: boolean
}

/** 安装包 manifest（品类无关——kind 区分 tool/provider；完整字段由各品类类型扩展） */
export interface InstallManifest {
  id: string
  /** 顶层展示名（provider 扩展有；工具包的 name 在 tool.name——此处可空） */
  name?: string
  entry: string
  apiVersion: number
  /** 版本号（provider 校验用；工具包可选） */
  version?: string
  /** 包类型（"tool" 分流到 toolsDir；缺省/其他 → providersDir） */
  kind?: string
  /** 能力标签（如 ["stt", "tts"]——展示用） */
  capabilities?: string[]
  /** 工具声明（kind:tool 包——tool.name 工具名） */
  tool?: { name?: string; displayName?: string; description?: string; categories?: string[] }
  assetDeps?: InstallAssetDep[]
  modelDeps?: InstallAssetDep[]
}
