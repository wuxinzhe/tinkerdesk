/**
 * renderer.ts — 提示词模板渲染器
 *
 * 复刻 tinker-agent PromptRenderer：
 * 加载 classpath 下的 .hbs 模板文件，用 Handlebars 渲染。
 * 模板目录：
 *   src/main/resources/prompts/           — 顶层模板（runtime-environment 等）
 *   src/main/resources/prompts/partials/  — 模块局部模板（skills-index 等）
 */
import {readFileSync} from 'fs'
import Handlebars from 'handlebars'
import {resolveResource} from '../../utils/resources-path'

/** 提示词模板渲染器 */
export class PromptRenderer {
  private readonly handlebars: typeof Handlebars

  constructor() {
    this.handlebars = Handlebars.create()
  }

  /**
   * 渲染模板文件。
   * @param name 模板名（不含路径和扩展名，如 'runtime-environment'、'skills-index'）
   * @param context 模板变量
   */
  render(name: string, context: Record<string, unknown>): string {
    try {
      const file = this.resolveTemplateFile(name)
      const source = readFileSync(file, 'utf-8')
      const template = this.handlebars.compile(source)
      return template(context)
    } catch (e) {
      console.warn(`提示词模板渲染失败: ${name} — ${(e as Error).message}`)
      return ''
    }
  }

  /** 内联编译模板字符串（动态模块/静态模块渲染用） */
  compileInline(templateSource: string): ((ctx: Record<string, unknown>) => string) | null {
    try {
      return this.handlebars.compile(templateSource)
    } catch (e) {
      console.warn(`内联模板编译失败 — ${(e as Error).message}`)
      return null
    }
  }

  /** 解析模板文件路径（先 partials 后顶层） */
  private resolveTemplateFile(name: string): string {
    const candidates = [
      resolveResource('prompts', 'partials', `${name}.hbs`),
      resolveResource('prompts', `${name}.hbs`),
    ]
    for (const c of candidates) {
      try {
        readFileSync(c, 'utf-8')
        return c
      } catch {
        // 尝试下一个
      }
    }
    throw new Error(`模板文件不存在: ${name}`)
  }
}
