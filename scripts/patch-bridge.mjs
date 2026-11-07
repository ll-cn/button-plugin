import fs from 'node:fs'
import path from 'node:path'

const NAME = 'alemonjs-load-yunzai/lib/yunzai/bridge.js'
const NEEDLE = 'prepared.references'
const PLAIN = '![' + '图片' + ']('
const SIZED = '![' + '图片 #0 #0' + ']('

const revert = process.argv.includes('--revert')

/** 在若干根目录里找桥文件 */
function findBridge() {
  const roots = [process.cwd(), path.resolve(process.cwd(), '..'), path.resolve(process.cwd(), '..', '..')]
  const found = []
  for (const root of roots) {
    for (const rel of [`node_modules/${NAME}`, `packages/${NAME}`]) {
      const file = path.join(root, rel)
      if (fs.existsSync(file)) found.push(file)
    }
  }
  return [...new Set(found)]
}

/** 替换图片语法，返回是否改动 */
function apply(file) {
  const code = fs.readFileSync(file, 'utf8')
  if (!code.includes(NEEDLE)) return 'skip'
  if (revert) {
    if (!code.includes(SIZED)) return 'skip'
    fs.writeFileSync(file, code.split(SIZED).join(PLAIN))
    return 'reverted'
  }
  if (code.includes(SIZED)) return 'skip'
  if (!code.includes(PLAIN)) return 'skip'
  fs.copyFileSync(file, `${file}.bak-btnpatch`)
  fs.writeFileSync(file, code.split(PLAIN).join(SIZED))
  return 'patched'
}

const files = findBridge()
if (!files.length) {
  console.log('找不到 bridge.js。请在 alemon 目录里执行：node scripts/patch-bridge.mjs')
  process.exit(1)
}

let changed = 0
for (const file of files) {
  const state = apply(file)
  if (state !== 'skip') changed++
  console.log(`${state.padEnd(8)} ${file}`)
}

console.log(changed ? '\n改完了，重启机器人后生效' : '\n没有需要改的地方')
