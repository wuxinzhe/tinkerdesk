# 打包与发布

## 打包产物

```
dist/TinkerDesk Setup X.Y.Z.exe   NSIS 安装包（分发物）
dist/latest.yml                   更新清单（electron-updater 读取）
dist/xxx.blockmap                 增量差分（快速更新）
dist/win-unpacked/                解包目录（本地调试——TinkerDesk.exe 直接跑）
```

## 打包流程

```bash
# 1. 生成 resources/npm（打包进应用的 npm-cli——插件 npm 依赖自动安装用——用户无需装 Node）
node scripts/package-npm.js

# 2. 构建 + 打包
npx electron-vite build
npx electron-builder --config electron-builder.yml
```

## electron-builder 配置要点

```yaml
appId: com.tinkerdesk.app
productName: TinkerDesk
icon: build/icon.png          # 打包图标（自动生成 .ico——exe/安装包/快捷方式）
extraResources:               # 应用资源（getResourcesDir 读取）
  - npm/                      # npm-cli（构建时生成）
  - tool-schemas/             # 工具 schema 模板
  - prompts/                  # 提示词 .hbs 模板
  - skill-categories.json
  - icon.png                  # 窗口/任务栏图标（BrowserWindow icon）
nsis: ...                     # 安装器配置
```

注意：
- electron-builder 的 `beforePack` 只接受函数（yml 写路径会报错）——资源生成由 package.json dist 脚本前置负责
- extraResources 漏配 → 启动 ENOENT（tool-schemas 读不到）——打包后必须验证 win-unpacked/resources 内容

## 更新机制（electron-updater）

```
更新源：GitHub Releases（wuxinzhe/tinkerdesk——provider: github）
启动时自动检查 → 发现更新后台下载 → IPC 通知 renderer 更新状态
最新包必须上传 exe + latest.yml + blockmap 三件套（GitHub Release 资产）
```

## 发布流程（Git Flow 轻量版）

```
1. feat/* 分支开发 → 合并回 main
2. 打包（上述流程）——验证 win-unpacked 能正常启动 + resources 齐全
3. 打 tag：git tag vX.Y.Z && git push origin vX.Y.Z
4. 发 Release：gh release create vX.Y.Z dist/*.exe dist/latest.yml dist/*.blockmap
   （PAT 需要 Contents: Read and write 权限——118MB 上传较慢——建议梯子/后台执行）
5. 验证 Release 资产与 latest.yml url 对齐（electron-updater 按 url 找文件）
```

## 版本注意事项

- 生产日志默认 INFO（debug 不落盘——LOG_LEVEL 环境变量覆盖）
- 安装版资源路径：process.resourcesPath（安装目录/resources）——getResourcesDir 候选顺序首位
- 用户零依赖：Electron 自带 Node 运行时 + 打包的 npm-cli——不需要装 Node.js

## 相关文档

- [开发环境](setup.md)
- [编码规范](conventions.md)
