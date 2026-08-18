# TinkerDesk 扩展安装与运维

目标：任何扩展都能被 Agent 完整安装（用户零操作）。核心 = 扩展自带 guide.md 说明文档，Agent 按文档操作，系统不内置任何扩展知识。

## 一、扩展包结构（约定）

```
扩展目录（%APPDATA%/tinkerdesk/plugins/<provider-id>/）
├── manifest.json   ← 元数据（必填：id / entry / apiVersion=1）
├── index.js        ← 入口（CommonJS，main 进程加载）
├── guide.md        ← 安装引导文档（推荐；有外部依赖的扩展必须带）
├── lib/            ← 扩展模块
├── node_modules/   ← 自带依赖（分发时包含）
├── models/         ← 模型文件（扩展下载逻辑管理）
└── config.json     ← 应用托管：{ enabled, config }（勿手改）
```

## 二、安装流程（按顺序执行）

### 1. 安装扩展包 → 调 `provider_install`
- `source` = 本地文件夹 / 本地 .zip / http(s) URL（URL 自动下载后安装）
- 返回 `{ ok, provider: { id, name, version }, status }` 或 `{ error }`
- 失败时如实返回错误（路径不存在/结构无效/扩展已存在），不要重复尝试

### 2. 读取扩展 guide.md → 调 `read_file`
路径：`%APPDATA%/tinkerdesk/plugins/<id>/guide.md`（Linux: `~/.config/tinkerdesk/plugins/<id>/guide.md`；macOS: `~/Library/Application Support/tinkerdesk/plugins/<id>/guide.md`）
- guide.md 不存在 → 扩展零依赖，直接跳到步骤 5
- 关注章节：**前置依赖 / 环境要求 / 安装步骤 / 常见路径**

### 3. 按 guide.md 准备环境 → 调 `terminal`
- 需要 Python venv：`python -m venv <venv>` → `<venv>/bin/pip install -r requirements.txt`（Windows: `<venv>/Scripts/pip.exe`）
- 需要模型：优先走扩展配置页自动下载（扩展实现 `models:download` 频道，下载走国内镜像，失败自动切换源）
- 环境变量可覆盖探测路径（各扩展 guide.md 会声明，如 `<ID>_PYTHON`、`<ID>_MODEL_DIR` 之类）
- 安装耗时长的命令：注意超时与进度反馈；失败后读取错误信息判断原因（网络/权限/依赖缺失）

### 4. 写入配置 → 调 `provider_configure`
- 不带 `values`：只读 schema + 当前配置（了解扩展要什么）
- 带 `values`：保存配置（如探测到的 pythonPath/modelDir 等路径类配置项）
- 探测优先级：预设路径 → 环境变量 → 用户手动指定（需要时询问用户）

### 5. 启用 → 调 `provider_enable`
- 内部先跑扩展 `check()` 自检
- 成功：`{ ok: true, enabled: true, started: true }` → 扩展已注册为 provider
- 失败：返回 `checks` 数组，每项含 `{ name, ok, hint, action }`：
  - `action=download-models` → 触发模型下载（扩展 `models:download` 频道）后重试启用
  - `action=open-config` → 检查配置项是否齐全（用 provider_configure 查看/补充）后重试
  - 按 hint 修复后重新 `provider_enable`，不要跳过自检

## 三、其他工具

| 工具 | 用途 |
|---|---|
| `provider_list` | 查看已安装扩展（id/name/version/status）|
| `provider_uninstall` | 卸载（停用 → 删除扩展目录含模型，**不可逆，先向用户确认**）|

## 四、已知事项与边界

- **环境不具备时**：扩展需要本机 GPU/外部引擎/特定软件时，guide.md 会写明；环境不具备则如实告知用户缺什么、怎么补（引导用户安装或手动指定路径），**不强行自动安装**（重型依赖自动安装失败率高且拖垮体验）
- **模型下载**：多源镜像回退 + 断点续传；下载中通过 `models:progress` 事件反馈进度
- **卸载语义**：扩展目录删除 = 模型一并删除（下载到扩展目录的）；扩展**外部**的环境（用户自行安装的引擎/模型库）不属于扩展，不删
- **安全模型**：扩展 = main 进程任意代码权限（v1 信任制），只安装用户明确要求/信任的扩展
- 安装失败排查顺序：路径/URL 有效性 → zip 结构（manifest.json）→ 依赖环境 → 自检项 hint
- 具体扩展的依赖细节一律以该扩展的 guide.md 为准，本 skill 只提供通用流程
