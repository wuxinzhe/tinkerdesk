/**
 * center/types.ts —— 品类中心统一抽象
 *
 * 各品类（tool / provider / skill / app / skin）都有一个 *-center，
 * 职责统一：只负责 安装 / 卸载 / 可用性检查（生命周期）。
 * 业务上层各自处理（工具→ToolManager 授权、扩展→provider 配置、技能→per-agent 装配）。
 * 安装器分层：工具/扩展/app 走分步安装器；skill/skin 走简易安装（installer 内简易方法）。
 */

/** 已装清单项 */
export interface CenterItem {
  id: string
  ok: boolean
  reason?: string
}

/** 品类中心统一接口 */
export interface ICenter {
  /** 从 npm 安装（分步安装器——validate/copy/deps/assets + center 自己的注册） */
  installFromNpm(pkgName: string, opts?: { registry?: string }): Promise<{ id: string }>
  /** 卸载（移除目录 + 上层反注册） */
  uninstall(id: string): void
  /** 可用性检查（入口存在 + 加载有效） */
  check(id: string): { ok: boolean; reason?: string }
  /** 已装清单（含可用性） */
  list(): CenterItem[]
  /** 启动扫描加载全部已装 */
  loadAll(): void
}
