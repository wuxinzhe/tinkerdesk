/**
 * system-interfaces.ts — 系统开放接口定义（单一来源）
 *
 * The app's externally exposed capability interfaces. Any provider declaring
 * an interface in manifest.systemInterfaces (id match) and registering the
 * matching channels in its entry becomes a provider for that interface.
 *
 * ProviderManager maintains the per-interface provider registry from this list;
 * system settings pages (e.g. voice settings) pick which provider to use
 * for a given interface from the registry.
 */

import type { SystemInterfaceDef } from './types'

/** 应用当前开放的全部接口（新增接口 = 在此追加一行 + 扩展侧声明实现） */
export const SYSTEM_INTERFACES: SystemInterfaceDef[] = [
  {
    id: 'voice.stt',
    name: '语音输入（STT）',
    description: '把录音转成文本（应用负责录音，扩展负责识别）',
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
    description: '把查询词转成搜索结果列表（扩展实现自己的搜索源）',
    requiredChannel: 'search:query',
    optionalChannels: ['models:status', 'models:download'],
  },
  {
    id: 'web.extract',
    name: '网页抓取',
    description: '把 URL 抓成干净文本（扩展实现自己的抓取服务）',
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
  ]

/** 按 id 查接口定义 */
export function findSystemInterface(id: string): SystemInterfaceDef | undefined {
  return SYSTEM_INTERFACES.find((def) => def.id === id)
}

/** 扩展声明实现的接口中，属于系统开放接口的那些 */
export function matchSystemInterfaces(declared: { id: string; version: number }[] | undefined): SystemInterfaceDef[] {
  if (!declared) return []
  return SYSTEM_INTERFACES.filter((def) => declared.some((d) => d.id === def.id))
}
