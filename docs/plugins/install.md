# 安装

## 安装方式

```
① zip 包：应用内选择 zip → 解压复制到 plugins/<id>/ → 校验 manifest → 加载
② 目录：选择插件文件夹 → 复制到 plugins/<id>/ → 校验 manifest → 加载
③ 加载流程：installFromPath → 复制（排除 node_modules/.cache）→
   检测 package.json 有 dependencies 且无 node_modules → npm install
   （resolveNpmCli 三级：resources/npm 打包版 → 项目 node_modules → 系统 npm）
   → loadPlugin（worker 加载 + init + 契约校验）→ 启用
```

## 依赖三分层

| 层次 | 声明位置 | 安装方式 | 用户需要做什么 |
|:--|:--|:--|:--|
| npm 依赖 | 插件 package.json | **自动**（安装时 install——装到插件自己的 node_modules——用户无需装 Node——Electron 自带 Node 跑打包的 npm-cli） | 无 |
| 资源下载 | manifest assetDeps | 声明式 URL 下载（设置页引导） | 点一下（显示大小/来源） |
| 外部系统 | install.md | **用户自管**（按说明自己装） | 装引擎/环境（如 IndexTTS）——应用只对接 |

## 原则（插件边界）

```
插件 = 粘合层——只做接口对接——不包装外部依赖。
外部系统版本用户自管（应用不代装、不代管版本——帮装=帮管版本=维护地狱）。
安装动作只发生在应用内插件目录（plugins/<id>/）——不碰系统全局。
```

## 安全

- 用户手动下载解压 = 主动信任（应用不自动下载安装任意代码）
- 插件在独立 Worker 线程运行（崩溃/死循环不拖垮主进程）
- 插件目录外安装动作由用户自管——应用不代执行任意命令

## 相关文档

- [插件体系](overview.md)
- [manifest 规范](manifest.md)
- [插件开发](development.md)
