import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url))

/** 插件根目录 */
export const PLUGIN_ROOT = path.resolve(SELF_DIR, '..')

/** 插件名，显示在页脚与更新提示里 */
export const PLUGIN_NAME = 'button-plugin'

/** 仓库地址 */
export const REPO_URL = 'https://github.com/ll-cn/button-plugin.git'

/** 云崽显示名 */
const YUNZAI_NAME = 'TRSS-Yunzai'

/** 当前插件版本，唯一来源是 package.json */
export const VERSION = readVersion()

function readVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'package.json'), 'utf8'))
    return pkg.version ? String(pkg.version) : '0.0.1'
  } catch {
    return '0.0.1'
  }
}

/** 当前运行的云崽版本 */
export function yunzaiVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))
    return pkg.version ? String(pkg.version) : '未知'
  } catch {
    return '未知'
  }
}

/** 页脚版本串：TRSS-Yunzai v3.1.3 · button-plugin v0.0.1 */
export function versionLine() {
  return `${YUNZAI_NAME} v${yunzaiVersion()} · ${PLUGIN_NAME} v${VERSION}`
}
