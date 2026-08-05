/**
 * model-ipc.ts — 主进程
 * 模型管理 IPC handlers：本地 SQLite custom_models 表 CRUD
 * 参考 showing-agent ModelController 的接口语义，去掉 user_id/profile 维度（本地单用户）
 */
import {ipcMain} from 'electron'
import {CustomModelRepository} from './repository/custom-model-repository'
import type {CreateCustomModelInput, UpdateCustomModelInput} from './repository/types'

/** 本地单用户 profile（repository 不再提供默认值，调用方显式传入） */
const PROFILE = 'default'

/** 注册模型管理 IPC（在 app ready 后调用） */
export function registerModelIpcHandlers(): void {
  // 列表（启用中）
  ipcMain.handle('model:list', () => {
    try {
      return {ok: true, data: CustomModelRepository.listEnabled(PROFILE)}
    } catch (e) {
      return {ok: false, error: (e as Error).message}
    }
  })

  // 详情
  ipcMain.handle('model:get', (_event, id: string) => {
    try {
      const model = CustomModelRepository.findById(id, PROFILE)
      if (!model) {
        return {ok: false, error: '模型不存在'}
      }
      return {ok: true, data: model}
    } catch (e) {
      return {ok: false, error: (e as Error).message}
    }
  })

  // 创建
  ipcMain.handle('model:create', (_event, input: CreateCustomModelInput) => {
    try {
      if (!input?.alias || !input?.modelName) {
        return {ok: false, error: 'alias 和 modelName 必填'}
      }
      const model = CustomModelRepository.create(input)
      return {ok: true, data: model}
    } catch (e) {
      return {ok: false, error: (e as Error).message}
    }
  })

  // 更新
  ipcMain.handle('model:update', (_event, id: string, input: UpdateCustomModelInput) => {
    try {
      const updated = CustomModelRepository.update(id, input ?? {}, PROFILE)
      return updated ? {ok: true} : {ok: false, error: '模型不存在'}
    } catch (e) {
      return {ok: false, error: (e as Error).message}
    }
  })

  // 删除
  ipcMain.handle('model:delete', (_event, id: string) => {
    try {
      const deleted = CustomModelRepository.delete(id, PROFILE)
      return deleted ? {ok: true} : {ok: false, error: '模型不存在'}
    } catch (e) {
      return {ok: false, error: (e as Error).message}
    }
  })

  // 更新连通性测试结果
  ipcMain.handle('model:update-test', (_event, id: string, passed: boolean) => {
    try {
      const updated = CustomModelRepository.updateTestPassed(id, passed, PROFILE)
      return updated ? {ok: true} : {ok: false, error: '模型不存在'}
    } catch (e) {
      return {ok: false, error: (e as Error).message}
    }
  })
}
