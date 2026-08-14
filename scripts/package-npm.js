/**
 * package-npm.js — 构建时打包 npm-cli 到 resources/npm（自包含——asar 外）
 *
 * 插件依赖安装需要 npm——用户无需安装 Node.js——
 * 用 Electron 自带的 node 执行这个 npm-cli（plugin-manager 的 resolveNpmCli）。
 *
 * 做法：npm pack npm（npm 发布包含 bundledDependencies——自包含）→
 * 解压到 resources/npm/ → 得到 bin/npm-cli.js + node_modules（完整依赖）。
 *
 * 触发：electron-builder afterPack（构建时自动跑——dev 不触发——
 * dev 用项目 node_modules/npm 或系统 npm）。
 */
const { execSync } = require('child_process')
const { existsSync, mkdirSync, rmSync, readdirSync } = require('fs')
const { join, resolve } = require('path')

const root = resolve(__dirname, '..')
const resourcesDir = join(root, 'resources')
const npmDir = join(resourcesDir, 'npm')

function main() {
  // 已存在且含 npm-cli.js → 跳过（避免每次构建重复打包）
  if (existsSync(join(npmDir, 'bin', 'npm-cli.js'))) {
    console.log('[package-npm] resources/npm 已存在——跳过')
    return
  }
  mkdirSync(resourcesDir, { recursive: true })
  rmSync(npmDir, { recursive: true, force: true })
  const tmpTgz = join(resourcesDir, 'npm.tgz')
  console.log('[package-npm] npm pack npm → resources/npm')
  execSync(`npm pack npm --pack-destination ${resourcesDir}`, { cwd: root, stdio: 'inherit' })
  // npm pack 产物名形如 npm-11.19.0.tgz（readdirSync 找——不用 shell 通配）
  const tgz = readdirSync(resourcesDir).find((f) => f.startsWith('npm-') && f.endsWith('.tgz'))
  if (!tgz) throw new Error('[package-npm] 未找到 npm pack 产物')
  execSync(`tar -xzf "${join(resourcesDir, tgz)}" -C "${resourcesDir}"`)
  rmSync(npmDir, { recursive: true, force: true })
  execSync(`mv "${join(resourcesDir, 'package')}" "${npmDir}"`)
  rmSync(join(resourcesDir, tgz), { recursive: true, force: true })
  console.log('[package-npm] 完成 → resources/npm')
}

main()
