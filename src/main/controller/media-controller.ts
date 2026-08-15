/**
 * media-controller.ts — 聊天媒体附件（图片/音频/视频）持久化
 *
 * - media:pick-and-import: file picker → copy into media dir → return relative path
 *   (renderer assembles [Image/Audio/Video attached at: media/xxx] text message)
 * - Structure: register() only binds ipcMain.handle; logic lives in named methods
 */
import { dialog } from 'electron'
import { handleTrusted } from '../security/ipc-guard'
import type { ApiResponse } from './api-response'
import { ok, fail } from './api-response'
import { importMediaFile, resolveMediaPath } from '../service/media-service'
import { existsSync, copyFileSync } from 'node:fs'
import { basename } from 'node:path'

/** 媒体控制器 */
export class MediaController {
  register(): void {
    handleTrusted('media:pick-and-import', async (_event, payload) => this.pickAndImport(payload))
    handleTrusted('media:pick-images', async (_event) => this.pickImages())
    handleTrusted('media:save-as', async (_event, payload) => this.saveAs(payload))
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
            : [{ name: '所有文件', extensions: ['*'] }]
    try {
      const result = await dialog.showOpenDialog({
        title: '选择要发送的多媒体文件',
        properties: ['openFile'],
        filters,
      })
      if (result.canceled || result.filePaths.length === 0) {
        // 取消 = 正常返回空（不是错误——前端不弹提示）
        return ok('')
      }
      const rel = importMediaFile(result.filePaths[0])
      return ok(rel)
    } catch (e) {
      return fail(e instanceof Error ? e.message : '导入媒体失败')
    }
  }

  /** 多图选择（最多 5 张）→ 返回相对路径数组（media/xxx.jpg） */
  private async pickImages(): Promise<ApiResponse<string[]>> {
    try {
      const result = await dialog.showOpenDialog({
        title: '选择图片（最多 5 张）',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
      })
      if (result.canceled || result.filePaths.length === 0) {
        // 取消 = 正常返回空数组（不是错误——前端不弹提示）
        return ok([])
      }
      const picked = result.filePaths.slice(0, 5)
      const rels = picked.map((p) => importMediaFile(p))
      return ok(rels)
    } catch (e) {
      return fail(e instanceof Error ? e.message : '导入图片失败')
    }
  }

  /** 媒体文件另存为（消息列表下载按钮——保存对话框 → 复制到用户选择位置） */
  private async saveAs(payload: { relPath?: string }): Promise<ApiResponse<string>> {
    try {
      const relPath = payload?.relPath
      if (!relPath) return fail('缺少文件路径')
      const absPath = resolveMediaPath(relPath)
      if (!existsSync(absPath)) {
        return fail(`文件不存在: ${absPath}`)
      }
      const defaultName = basename(absPath)
      const result = await dialog.showSaveDialog({
        title: '保存文件',
        defaultPath: defaultName,
      })
      if (result.canceled || !result.filePath) {
        // 取消 = 正常返回空（不是错误——前端不弹提示）
        return ok('')
      }
      copyFileSync(absPath, result.filePath)
      return ok(result.filePath)
    } catch (e) {
      return fail(e instanceof Error ? e.message : '保存失败')
    }
  }
}
