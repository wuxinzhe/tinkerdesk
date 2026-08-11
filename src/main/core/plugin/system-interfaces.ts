/**
 * system-interfaces.ts — 系统开放接口定义（单一来源）
 *
 * 应用对外暴露的能力接口清单。任何插件在 manifest.systemInterfaces 声明
 * 实现某个接口（id 匹配），并在入口注册对应频道，即成为该接口的 provider。
 *
 * PluginManager 按此清单维护每个接口的 provider 注册表；
 * 系统设置页（如语音设置）从注册表中选择该接口具体调用哪个 provider。
 */

export interface SystemInterfaceDef {
  /** 接口 id（插件 manifest.systemInterfaces[].id 必须精确匹配） */
  id: string
  /** 展示名（系统设置页） */
  name: string
  /** 描述 */
  description?: string
  /** 契约：实现该接口必须注册的插件频道（PluginManager 注册时校验）——空串 = 无契约频道（工具直连 provider） */
  requiredChannel: string
  /** 契约：实现该接口必须注册的可选频道（如 models:status 模型管理） */
  optionalChannels?: string[]
}

/** 应用当前开放的全部接口（新增接口 = 在此追加一行 + 插件侧声明实现） */
export const SYSTEM_INTERFACES: SystemInterfaceDef[] = [
  {
    id: 'voice.stt',
    name: '语音输入（STT）',
    description: '把录音转成文本（应用负责录音，插件负责识别）',
    requiredChannel: 'stt:transcribe',
    optionalChannels: ['models:status', 'models:download'],
  },
  {
    id: 'voice.tts',
    name: '朗读（TTS）',
    description: '把文本合成语音（返回 audio data URL）',
    requiredChannel: 'tts:speak',
    optionalChannels: ['models:status', 'models:download'],
  },
  {
    id: 'web.search',
    name: '网页搜索',
    description: '把查询词转成搜索结果列表（插件实现自己的搜索源）',
    requiredChannel: 'search:query',
    optionalChannels: ['models:status', 'models:download'],
  },
  {
    id: 'web.extract',
    name: '网页抓取',
    description: '把 URL 抓成干净文本（插件实现自己的抓取服务）',
    requiredChannel: 'extract:fetch',
    optionalChannels: ['models:status', 'models:download'],
  },
  {
    id: 'tool.tts',
    name: '文本转语音（Agent 工具）',
    description: 'Agent 工具的 TTS：文本 → 音频文件路径（与系统朗读 voice.tts 分开）',
    requiredChannel: 'tts:speak_file',
    optionalChannels: ['models:status', 'models:download'],
  },
  {
    id: 'tool.stt',
    name: '语音转文本（Agent 工具）',
    description: 'Agent 工具的 STT：音频文件路径 → 文本（与系统输入 voice.stt 分开）',
    requiredChannel: 'stt:transcribe_file',
    optionalChannels: ['models:status', 'models:download'],
  },
  {
    id: 'tool.computer_use',
    name: '桌面控制（Agent 工具）',
    description: 'Agent 工具的 computer_use：后台桌面自动化（cua-driver——截图/鼠标/键盘/窗口）',
    // 无契约频道——执行由工具经 provider 直连（不经过插件 IPC）
    requiredChannel: '',
  },
]

/** 按 id 查接口定义 */
export function findSystemInterface(id: string): SystemInterfaceDef | undefined {
  return SYSTEM_INTERFACES.find((def) => def.id === id)
}

/** 插件声明实现的接口中，属于系统开放接口的那些 */
export function matchSystemInterfaces(declared: { id: string; version: number }[] | undefined): SystemInterfaceDef[] {
  if (!declared) return []
  return SYSTEM_INTERFACES.filter((def) => declared.some((d) => d.id === def.id))
}
