# 重写 tinkerdesk-plugin-install skill（详细正文 + 字段补全）
import os, sqlite3, datetime

DB_PATH = os.path.join(os.environ.get('APPDATA', ''), 'tinkerdesk', 'tinkerdesk.db')

BODY = """---
name: tinkerdesk-plugin-install
description: 安装/管理 TinkerDesk 插件时加载。完整流程：plugin_install 装包 → read_file 读插件目录 guide.md → 按文档用 terminal 准备环境依赖 → plugin_configure 写入配置 → plugin_enable 启用验证。用户说"装插件/安装插件/卸载插件/配置插件"时使用。
---

# TinkerDesk 插件安装与运维

目标：任何插件都能被 Agent 完整安装（用户零操作）。核心 = 插件自带 guide.md 说明文档，Agent 按文档操作，系统不内置任何插件知识。

## 一、插件包结构（约定）

```
插件目录（%APPDATA%/tinkerdesk/plugins/<plugin-id>/）
├── manifest.json   ← 元数据（必填：id / entry / apiVersion=1）
├── index.js        ← 入口（CommonJS，main 进程加载）
├── guide.md        ← 安装引导文档（推荐；有外部依赖的插件必须带）
├── lib/            ← 插件模块
├── node_modules/   ← 自带依赖（分发时包含）
├── models/         ← 模型文件（插件下载逻辑管理）
└── config.json     ← 应用托管：{ enabled, config }（勿手改）
```

## 二、安装流程（按顺序执行）

### 1. 安装插件包 → 调 `plugin_install`
- `source` = 本地文件夹 / 本地 .zip / http(s) URL（URL 自动下载后安装）
- 返回 `{ ok, plugin: { id, name, version }, status }` 或 `{ error }`
- 失败时如实返回错误（路径不存在/结构无效/插件已存在），不要重复尝试

### 2. 读取插件 guide.md → 调 `read_file`
路径：`%APPDATA%/tinkerdesk/plugins/<id>/guide.md`（Linux: `~/.config/tinkerdesk/plugins/<id>/guide.md`；macOS: `~/Library/Application Support/tinkerdesk/plugins/<id>/guide.md`）
- guide.md 不存在 → 插件零依赖，直接跳到步骤 5
- 关注章节：**前置依赖 / 环境要求 / 安装步骤 / 常见路径**

### 3. 按 guide.md 准备环境 → 调 `terminal`
- 需要 Python venv：`python -m venv <venv>` → `<venv>/bin/pip install -r requirements.txt`（Windows: `<venv>/Scripts/pip.exe`）
- 需要模型：优先走插件配置页自动下载（插件实现 `models:download` 频道，下载走国内镜像 ghfast.top/hf-mirror，自动回退）
- 环境变量可覆盖探测路径（如 `OMNI_VENV_PYTHON`、`OMNI_MODEL_DIR`）
- 安装耗时长的命令：注意超时与进度反馈；失败后读取错误信息判断原因（网络/权限/依赖缺失）

### 4. 写入配置 → 调 `plugin_configure`
- 不带 `values`：只读 schema + 当前配置（了解插件要什么）
- 带 `values`：保存配置（如探测到的 pythonPath/modelDir/voiceProfile）
- 探测优先级：预设路径 → 环境变量 → 用户手动指定（需要时询问用户）

### 5. 启用 → 调 `plugin_enable`
- 内部先跑插件 `check()` 自检
- 成功：`{ ok: true, enabled: true, started: true }` → 插件已注册为 provider
- 失败：返回 `checks` 数组，每项含 `{ name, ok, hint, action }`：
  - `action=download-models` → 触发模型下载（插件 `models:download` 频道）后重试启用
  - `action=open-config` → 检查配置项是否齐全（用 plugin_configure 查看/补充）后重试
  - 按 hint 修复后重新 `plugin_enable`，不要跳过自检

## 三、其他工具

| 工具 | 用途 |
|---|---|
| `plugin_list` | 查看已安装插件（id/name/version/status）|
| `plugin_uninstall` | 卸载（停用 → 删除插件目录含模型，**不可逆，先向用户确认**）|

## 四、已知事项与边界

- **OmniVoice 插件**需要本机 NVIDIA GPU + Python（torch CUDA，2.5GB+ 依赖）——环境不具备时如实告知用户"该插件需要 GPU/环境"，**不强行安装**（自动安装失败率高且会拖垮体验）
- **模型下载**：多源镜像回退（ghfast.top → gh-proxy → GitHub），断点续传；下载中通过 `models:progress` 事件反馈进度
- **卸载**：插件目录删除 = 模型一并删除（下载到插件目录的）；本机预装环境（如 C:\\tools\\omnivoice）不属于插件，不删
- **安全模型**：插件 = main 进程任意代码权限（v1 信任制），只安装用户明确要求/信任的插件
- 安装失败排查顺序：路径/URL 有效性 → zip 结构（manifest.json）→ 依赖环境 → 自检项 hint
"""

now = datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# 查现有记录（保留 id）
row = cur.execute(
    "SELECT id FROM private_skills WHERE name = 'tinkerdesk-plugin-install' AND profile = 'default'"
).fetchone()
if not row:
    print('ERROR: skill 不存在，先运行 seed 脚本')
    conn.close()
    raise SystemExit(1)
sid = row[0]

cur.execute(
    """UPDATE private_skills SET
       display_name = ?, description = ?, category = ?, version = ?, author = ?, license = ?,
       platforms = ?, tags = ?, dependencies = ?, requires_tools = ?, triggers = ?,
       body = ?, updated_at = ?
     WHERE id = ?""",
    (
        '插件安装引导',
        '安装/管理 TinkerDesk 插件时加载：plugin_install 装包 → 读 guide.md → 准备环境 → 配置 → 启用',
        'plugin', '1.0.0', 'TinkerDesk', 'MIT',
        'desktop', 'plugin,install,agent', '',
        'desktop_tinker_plugin_install,desktop_tinker_plugin_configure,desktop_tinker_plugin_enable,desktop_tinker_plugin_list,desktop_tinker_plugin_uninstall,desktop_tinker_read_file,desktop_tinker_terminal',
        '装插件,安装插件,卸载插件,配置插件,plugin install',
        BODY, now, sid,
    ),
)
cur.execute(
    "UPDATE private_skill_files SET content = ? WHERE skill_id = ? AND file_type = 'SKILL.md'",
    (BODY, sid),
)
conn.commit()
conn.close()
print('OK skill 已重写:', sid)
