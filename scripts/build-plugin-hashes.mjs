#!/usr/bin/env node
/**
 * 插件分发包哈希清单生成器
 *
 * 用法：node scripts/build-plugin-hashes.mjs <插件目录>
 * 作用：为插件目录内每个文件生成 sha256 哈希，写入 <插件目录>/sha256sums.json
 *       （清单自身与 manifest.json 不列入——manifest 由安装侧单独读取）
 *
 * 发布流程：
 *   1. 开发完插件（含 manifest.json + entry + 静态资源）
 *   2. 运行本脚本生成 sha256sums.json
 *   3. 打包 zip（zip 根目录 = 插件目录：含 manifest.json + sha256sums.json + 所有文件）
 *   4. 用户安装 zip 时应用逐文件校验哈希——不匹配拒绝安装
 */
import { createHash } from 'crypto'
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'fs'
import { join, relative } from 'path'

const pluginDir = process.argv[2]
if (!pluginDir) {
  console.error('用法: node scripts/build-plugin-hashes.mjs <插件目录>')
  process.exit(1)
}
if (!existsSync(join(pluginDir, 'manifest.json'))) {
  console.error(`错误: ${pluginDir} 不是有效插件目录（缺少 manifest.json）`)
  process.exit(1)
}

/** 递归收集文件（相对路径，正斜杠） */
function collectFiles(dir, root, acc) {
  for (const name of readdirSync(dir)) {
    if (name === 'sha256sums.json' || name === '.DS_Store') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      collectFiles(p, root, acc)
    } else {
      acc.push(relative(root, p).replace(/\\/g, '/'))
    }
  }
  return acc
}

const files = collectFiles(pluginDir, pluginDir, [])
const sums = {}
for (const rel of files) {
  sums[rel] = createHash('sha256').update(readFileSync(join(pluginDir, rel))).digest('hex')
}

const out = join(pluginDir, 'sha256sums.json')
writeFileSync(out, JSON.stringify(sums, null, 2) + '\n')
console.log(`✅ sha256sums.json 已生成（${Object.keys(sums).length} 个文件）`)
console.log(`   输出: ${out}`)
console.log('   打包 zip 时请包含 manifest.json + sha256sums.json + 全部文件')
