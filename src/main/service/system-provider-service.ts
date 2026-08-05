/**
 * system-provider-service.ts — 系统供应商服务层
 *
 * 复刻 showing-agent IProviderService 的供应商管理部分（本地单用户版）：
 * 供应商列表/详情/CRUD。
 */
import {SystemProviderRepository} from '../repository/system-provider-repository'
import type {SystemProviderEntity} from '../repository/types'

/** 系统供应商服务 */
export class SystemProviderService {
  constructor(private readonly providerRepo: SystemProviderRepository) {}

  /** 查询全部供应商 */
  findAll(): SystemProviderEntity[] {
    return this.providerRepo.findAll()
  }

  /** 按 ID 查询 */
  findById(id: string): SystemProviderEntity | null {
    return this.providerRepo.findById(id)
  }

  /** 创建供应商 */
  create(entity: SystemProviderEntity): boolean {
    const existing = this.providerRepo.findById(entity.id)
    if (existing) {
      return false
    }
    this.providerRepo.insert(entity)
    return true
  }

  /** 更新供应商 */
  update(entity: SystemProviderEntity): boolean {
    return this.providerRepo.update(entity) > 0
  }

  /** 删除供应商 */
  deleteById(id: string): boolean {
    return this.providerRepo.deleteById(id) > 0
  }
}
