/**
 * media-controller.ts — 聊天媒体附件（图片/音频/视频）持久化
 *
 * - media:pick-and-import：弹文件选择框 → 复制到 media 目录 → 返回相对路径
 *   （前端拼装 [Image/Audio/Video attached at: media/xxx] 文本消息）
 * - 结构：register() 只做 ipcMain.handle 绑定，逻辑在独立具名方法
 */
import { dialog } from 'electron'
import { handleTrusted } from '../security/ipc-guard'
import type { ApiResponse } from './api-response'
import { ok, fail } from './api-response'
import { importMediaFile } from '../service/media-service'

/** 媒体控制器 */
export class MediaController {
  register(): void {
    handleTrusted('media:pick-and-import', async (_event, payload) => this.pickAndImport(payload))
  }

  /** 弹文件选择框 → 复制到 media 目录 → 返回相对路径（media/xxx.ext） */
  private async pickAndImport(payload: { kind?: 'image' | 'audio' | 'video' }): Promise<ApiResponse<string>> {
    const kind = payload?.kind
    const filters: Electron.FileFilter[] =
      kind === 'image'
        ? [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
        : kind === 'audio'
          ? [{ name: '音频', extensions: ['wav', 'mp3', 'ogg', 'm4a', 'flac'] }]
          : kind === 'video'
            ? [{ name: '视频', extensions: ['mp4', 'webm', 'mkv', 'mov'] }]
            : [
                { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
                { name: '音频', extensions: ['wav', 'mp3', 'ogg', 'm4a', 'flac'] },
                { name: '视频', extensions: ['mp4', 'webm', 'mkv', 'mov'] },
                { name: '所有文件', extensions: ['*'] },
              ]
    try {
      const result = await dialog.showOpenDialog({
        title: '选择要发送的多媒体文件',
        properties: ['openFile'],
        filters,
      })
      if (result.canceled || result.filePaths.length === 0) {
        return fail('已取消')
      }
      const rel = importMediaFile(result.filePaths[0])
      return ok(rel)
    } catch (e) {
      return fail((e as Error).message)
    }
  }
}
