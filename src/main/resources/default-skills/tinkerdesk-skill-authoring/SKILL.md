# TinkerDesk Skill 编写规范

目标：任何 skill 都能被 Agent 正确加载、被用户在详情页清晰阅读。核心：元数据走表字段，正文（body）是纯 Markdown，不写 frontmatter。

## 一、元数据字段（private_skills 表）

| 字段 | 说明 | 示例 |
|---|---|---|
| name | 唯一名（小写字母/数字/连字符） | tinkerdesk-provider-install |
| display_name | 显示名 | 扩展安装引导 |
| description | 描述 + 触发条件（第一句含触发词） | 安装/管理扩展时加载：… |
| category | 分类 | provider / agent / devops / research |
| version / author / license | 版本 / 作者 / 许可 | 1.0.0 / TinkerDesk / MIT |
| platforms | 逗号分隔平台 | desktop |
| tags | 逗号分隔标签 | provider,install,agent |
| dependencies | 逗号分隔依赖 | |
| requires_toolsets | 逗号分隔所需工具集 | |
| requires_tools | 逗号分隔所需工具名 | desktop_tinker_provider_install,desktop_tinker_read_file |
| fallback_for_toolsets / fallback_for_tools | 回退声明（逗号分隔） | |
| triggers | 逗号分隔触发词 | 装扩展,安装扩展,配置扩展 |
| trigger_conditions | 触发条件描述 | |
| config | JSON 字符串（默认 []） | [] |
| env_vars / commands / envs | 环境变量 / 命令 / 环境 | |
| body | 正文（纯 Markdown） | 见下 |

## 二、正文（body）规范

- **纯 Markdown**，以 `# 标题` 开头；**不写 `---` frontmatter**——name/description 等由表字段存储，系统渲染时分别取字段（`{{name}}` + `{{description}}` + `{{body}}`），body 里重复写元数据会造成详情页展示重复
- 结构建议：`# 目标` → `## 章节` → `### 步骤`；步骤用编号列表，参数用反引号 `` `tool_name` ``，返回结构用代码块
- 描述要**具体可执行**（Agent 会按步骤操作），避免空话
- **通用 skill 不写具体业务实例**（具体扩展名 / 服务名 / 产品名属于对应对象自己的文档，如扩展的 guide.md）；通用流程只讲方法
- 长文档用表格归纳（工具清单、字段映射等），比大段文字可读性强

## 三、创建 / 更新方式

1. 应用内：Agent 调 `skill_manage` 工具（SkillManageTool）创建 / 更新
2. 或直接写数据库：
   - `private_skills` 表：`profile='default'`，按字段写入
   - `private_skill_files` 表：`file_type='SKILL.md'` 存正文副本（详情页文件列表用）

## 四、自检清单

- [ ] name 唯一、小写连字符
- [ ] description 第一句含触发词（Agent 靠它决定何时加载）
- [ ] body 以 `# ` 开头，**无 frontmatter**
- [ ] requires_tools 列出正文引用的全部工具
- [ ] category 合理（provider/agent/devops/…）
- [ ] 通用 skill 不夹带具体业务对象信息
