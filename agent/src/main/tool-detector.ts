/**
 * tool-detector.ts — 主进程
 * 运行时检测本机可用的桌面工具集。
 * 遍历所有已注册的工具，调用 checkAvailability()，
 * 只返回当前环境真正可用的工具。
 */
import { allDesktopTools } from '../tools/desktop/manifest'
import type { BaseTool, ToolSchema } from '../tools/desktop/index'
import type { DesktopToolDef } from '@/defines/tools/detector-types'

/**
 * 检测所有工具在当前环境的可用性。
 * 返回 { tools: 可用的工具列表, unavailable: 不可用的工具及原因 }
 */
export async function detectDesktopTools(): Promise<{
  tools: DesktopToolDef[]
  unavailable: Array<{ id: string; reason: string }>
}> {
  const tools: DesktopToolDef[] = []
  const unavailable: Array<{ id: string; reason: string }> = []

  for (const tool of allDesktopTools) {
    const result = await tool.checkAvailability()
    if (result.available) {
      tools.push({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        source: 'desktop' as const,
        category: tool.category,
        schema: tool.getSchema()
      })
    } else {
      unavailable.push({ id: tool.id, reason: result.reason ?? '未知原因' })
    }
  }

  // ffmpeg: 外部命令检测，不是通过 Tool 接口注册的
  try {
    const { execSync } = await import('child_process')
    execSync('ffmpeg -version', { stdio: 'ignore' })
    tools.push({
      id: 'ffmpeg',
      name: '音视频处理',
      description: 'FFmpeg 音视频转换',
      source: 'desktop' as const,
      category: 'media',
      schema: ffmpegSchema
    })
  } catch {
    unavailable.push({ id: 'ffmpeg', reason: 'ffmpeg 未安装' })
  }

  return { tools, unavailable }
}

const ffmpegSchema: ToolSchema = {
  type: 'function',
  function: {
    name: 'ffmpeg',
    description: 'FFmpeg audio/video conversion tool. Converts between media formats.',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Input file path' },
        output: { type: 'string', description: 'Output file path' },
        options: { type: 'string', description: 'FFmpeg options/flags' }
      },
      required: ['input', 'output']
    }
  },
  toolType: 'desktop'
}
