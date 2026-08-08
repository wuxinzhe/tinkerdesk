/**
 * constants/index.ts — renderer 层统一常量
 *
 * 展示文本/交互文案（main 不消费、renderer 独立包无法引 main 常量——归此处）。
 * 命名对齐 main core/constants 体系。
 */

/** 交互结果内容文本 */
export const STATUS_CONTENT_APPROVED = '✅ 已批准'
export const STATUS_CONTENT_REJECTED = '❌ 已拒绝'
export const STATUS_CONTENT_TIMED_OUT = '⏰ 已过期'
