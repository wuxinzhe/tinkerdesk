/**
 * model-store.ts — 模型管理域
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { modelsApi } from '@/api/models-api'
import type { SystemProvider, ModelInfo, CustomModelInfo, SceneModelDetail, CreateCustomModelRequest } from '@/defines/models/model'
import type { UpdateCustomModelParams, CustomModelTestResult, BindSceneModelRequest } from '@/api/models-api'

export const useModelStore = defineStore('model', () => {
  const loading = ref(false)

  async function listProviders(): Promise<SystemProvider[]> {
    try {
      return await modelsApi.listProviders()
    } catch {
      return []
    }
  }

  async function getProvider(id: string): Promise<SystemProvider | null> {
    try {
      return await modelsApi.getProvider(id)
    } catch {
      return null
    }
  }

  async function fetchModels(providerId: string, apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
    try {
      return await modelsApi.fetchModels(providerId, apiKey, baseUrl)
    } catch {
      return []
    }
  }

  async function listCustomModels(): Promise<CustomModelInfo[]> {
    try {
      return await modelsApi.listCustomModels()
    } catch {
      return []
    }
  }

  async function createCustomModel(data: CreateCustomModelRequest): Promise<{ id: string } | null> {
    try {
      return await modelsApi.createCustomModel(data)
    } catch {
      return null
    }
  }

  async function updateCustomModel(id: string, data: UpdateCustomModelParams): Promise<void> {
    await modelsApi.updateCustomModel(id, data)
  }

  async function deleteCustomModel(id: string): Promise<void> {
    await modelsApi.deleteCustomModel(id)
  }

  async function testCustomModel(id: string): Promise<CustomModelTestResult | null> {
    return modelsApi.testCustomModel(id)
  }

  async function listSceneModels(profile: string): Promise<SceneModelDetail[]> {
    try {
      return await modelsApi.listSceneModels(profile)
    } catch {
      return []
    }
  }

  async function bindSceneModel(data: BindSceneModelRequest): Promise<void> {
    await modelsApi.bindSceneModel(data)
  }

  async function unbindSceneModel(sceneId: string, priority: number, profile: string): Promise<void> {
    await modelsApi.unbindSceneModel(sceneId, priority, profile)
  }

  return {
    loading,
    listProviders, getProvider, fetchModels,
    listCustomModels, createCustomModel, updateCustomModel, deleteCustomModel, testCustomModel,
    listSceneModels, bindSceneModel, unbindSceneModel
  }
})
