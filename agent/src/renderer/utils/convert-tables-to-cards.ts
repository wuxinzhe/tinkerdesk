/**
 * convert-tables-to-cards.ts — 将 HTML 中的 <table> 转换为手机模式卡片布局
 *
 * 桌面端渲染为原生 <table>，手机端用 JS 替换为卡片式 label/value 排列。
 * 每张卡片带行号 + 折叠开关（超过 ~2.5 个卡片高度时截断）。
 *
 * 配套 CSS 类（调用方引入）：
 *   .table-cards, .table-card, .table-card__row,
 *   .table-card__label, .table-card__value, .table-card__num,
 *   .table-cards__toggle, .table-cards__trigger, .table-cards__body
 */

/** 模块级计数器，确保每次调用生成的 id 全局唯一 */
let globalTableIdx = 0

/** 将 HTML 字符串中的所有 <table> 替换为卡片布局，非破坏性（返回新字符串） */
export function convertTablesToCards(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html

  const tables = div.querySelectorAll('table')
  tables.forEach((table) => {
    const uid = `tbl-${globalTableIdx++}`
    // 提取表头
    const headers: string[] = []
    const headerRow = table.querySelector('thead tr')
    if (headerRow) {
      headerRow.querySelectorAll('th, td').forEach((th) => {
        headers.push(th.textContent?.trim() || '')
      })
    }

    // 找不到表头时用列序号
    const rows = table.querySelectorAll('tbody tr')
    if (headers.length === 0 && rows.length > 0) {
      const firstRow = rows[0]
      firstRow.querySelectorAll('td').forEach((_, i) => {
        headers.push(`#${i + 1}`)
      })
    }

    // 构建卡片清单容器
    const body = document.createElement('div')
    body.className = 'table-cards__body'

    rows.forEach((row, rowIdx) => {
      if (row.querySelector('th')) return // 跳过表头行

      const card = document.createElement('div')
      card.className = 'table-card'

      // 行号（右上角）
      const num = document.createElement('div')
      num.className = 'table-card__num'
      num.textContent = String(rowIdx + 1)
      card.appendChild(num)

      // 每列 → label: value 行
      const cells = row.querySelectorAll('td')
      cells.forEach((cell, colIdx) => {
        const label = headers[colIdx]
        if (!label && !cell.textContent?.trim()) return // 跳过空列

        const rowDiv = document.createElement('div')
        rowDiv.className = 'table-card__row'

        const labelSpan = document.createElement('span')
        labelSpan.className = 'table-card__label'
        labelSpan.textContent = label || ''

        const valueSpan = document.createElement('span')
        valueSpan.className = 'table-card__value'
        valueSpan.innerHTML = cell.innerHTML

        rowDiv.appendChild(labelSpan)
        rowDiv.appendChild(valueSpan)
        card.appendChild(rowDiv)
      })

      body.appendChild(card)
    })

    // 外层容器 + 折叠开关
    const wrapper = document.createElement('div')
    wrapper.className = 'table-cards'

    const toggle = document.createElement('input')
    toggle.type = 'checkbox'
    toggle.id = uid
    toggle.className = 'table-cards__toggle'

    const label = document.createElement('label')
    label.className = 'table-cards__trigger'
    label.htmlFor = uid

    wrapper.appendChild(toggle)
    wrapper.appendChild(body)
    wrapper.appendChild(label)

    table.parentNode?.replaceChild(wrapper, table)
  })

  return div.innerHTML
}
