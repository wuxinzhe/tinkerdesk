# 插件发布规范（npm）

TinkerDesk 插件以 **npm 包**形式分发——应用内输入包名即可在线安装。

## 1. 包结构（npm 包根）

```
<package-root>/
├── manifest.json      # 插件声明（id/entry/能力/configSchema/assetDeps）
├── index.js           # 插件入口（module.exports = { init(ctx) }）
├── core/              # 平台无关核心（业务逻辑）
├── scripts/           # 构建/校验脚本
├── guide.md           # 安装引导（外部依赖/模型说明）
├── README.md
└── package.json       # npm 元数据（name/version/main/files）
```

## 2. package.json 配置

```jsonc
{
  "name": "tinkerdesk-plugin-speech-sherpa",   // 命名：tinkerdesk-plugin-<id>
  "version": "0.1.0",                           // semver
  "main": "index.js",
  "files": [                                     // 发布白名单（关键！）
    "index.js",
    "manifest.json",
    "core/",
    "scripts/",
    "guide.md",
    "README.md"
  ],
  "scripts": {
    "verify": "node scripts/verify.js",         // 发布前校验
    "pack": "node scripts/pack.js"              // 构建 zip 包
  }
}
```

**files 白名单必须配置**——否则会把 node_modules/ 测试文件等杂物一起发布。

## 3. 发布前校验（必做）

```bash
npm install          # 装依赖（含 native——如 sherpa-onnx-node）
npm run verify       # 校验：manifest 完整 / 入口加载 / configSchema 存在 /
                     #       能力声明 / IPC 注册
```

`scripts/verify.js` 模拟应用加载（manifest.configSchema 必须存在——静态声明）。

## 4. 发布

```bash
npm login            # 首次（npmjs.com 账号）
npm publish          # 发布（默认 public——插件必须 public 才能被安装）
```

## 5. 版本规范（semver）

- `0.x.y`：初版迭代（API 不稳定期）
- `1.x.y`：稳定（插件契约 v1 冻结后）
- patch：修复/小改（`0.1.0 → 0.1.1`）
- minor：加能力/字段（`0.1.0 → 0.2.0`——manifest 加能力声明）
- major：破坏性变更（契约/配置结构不兼容）

应用侧 `installNpm(pkg)` 默认装最新——指定版本：`pkg@1.2.3`。

## 6. 应用内安装

```
插件管理 → 在线安装 → 输入 npm 包名（如 tinkerdesk-plugin-speech-sherpa）
→ npm pack 下载 → 解压 → 校验 → 复制 → npm install 依赖 → 加载
```

## 7. 注意事项

- **native 依赖**（sherpa-onnx-node 等）：npm install 自动装——
  但用户环境需匹配（Windows 预编译包）
- **外部引擎**（IndexTTS 等）：插件只做对接（粘合层）——
  引擎本体用户按 guide.md 自行安装（应用不代装）
- **模型资产**：大模型不进 npm 包——manifest.assetDeps 声明下载地址
  （应用侧下载——可选/跳过）
- **安全**：npm 包 = 可信分发渠道（官方 registry）——
  插件代码在 Worker 线程隔离执行
