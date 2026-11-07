import fs from 'node:fs'
import path from 'node:path'

const NAME = 'alemonjs-load-yunzai/lib/yunzai/bridge.js'

const IMAGE_PLAIN = '![' + '图片' + ']('
const IMAGE_SIZED = '![' + '图片 #0 #0' + ']('

const BUTTON_RE =
  /const actionData = item\.data \?\? item\.action\?\.data \?\? item\.options\?\.data \?\? title;\r?\n(\s*)const actionType = item\.type \?\? item\.action\?\.type;/
const BUTTON_MARK = 'item.callback ?? item.action?.callback'

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

/** 图片语法补尺寸 */
function patchImage(code) {
  if (revert) return code.includes(IMAGE_SIZED) ? code.split(IMAGE_SIZED).join(IMAGE_PLAIN) : code
  return code.includes(IMAGE_PLAIN) ? code.split(IMAGE_PLAIN).join(IMAGE_SIZED) : code
}

/** 按钮补 callback / link 字段支持 */
function patchButton(code) {
  const nl = code.includes('\r\n') ? '\r\n' : '\n'
  if (revert) {
    if (!code.includes(BUTTON_MARK)) return code
    return code.replace(
      /const callback = item\.callback \?\? item\.action\?\.callback;\r?\n(\s*)const link = item\.link \?\? item\.action\?\.link;\r?\n\s*const actionData = link \?\? callback \?\? item\.data \?\? item\.action\?\.data \?\? item\.options\?\.data \?\? title;\r?\n\s*const actionType = item\.type \?\? item\.action\?\.type \?\? \(link !== undefined \? 1 : callback !== undefined \? 0 : undefined\);/,
      `const actionData = item.data ?? item.action?.data ?? item.options?.data ?? title;${nl}$1const actionType = item.type ?? item.action?.type;`
    )
  }
  if (code.includes(BUTTON_MARK) || !BUTTON_RE.test(code)) return code
  return code.replace(BUTTON_RE, (_match, indent) =>
    [
      'const callback = item.callback ?? item.action?.callback;',
      `${indent}const link = item.link ?? item.action?.link;`,
      `${indent}const actionData = link ?? callback ?? item.data ?? item.action?.data ?? item.options?.data ?? title;`,
      `${indent}const actionType = item.type ?? item.action?.type ?? (link !== undefined ? 1 : callback !== undefined ? 0 : undefined);`
    ].join(nl)
  )
}

const files = findBridge()
if (!files.length) {
  console.log('找不到 bridge.js。请在 alemon 目录里执行：node plugins/button-plugin/scripts/patch-bridge.mjs')
  process.exit(1)
}

let changed = 0
for (const file of files) {
  const code = fs.readFileSync(file, 'utf8')
  const next = patchButton(patchImage(code))
  if (next === code) {
    console.log(`skip     ${file}`)
    continue
  }
  if (!revert && !fs.existsSync(`${file}.bak-btnpatch`)) fs.copyFileSync(file, `${file}.bak-btnpatch`)
  fs.writeFileSync(file, next)
  changed++
  console.log(`${revert ? 'reverted' : 'patched '} ${file}`)
}

console.log(changed ? '\n改完了，重启机器人后生效' : '\n没有需要改的地方')
