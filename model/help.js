import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { labelOf } from './rows.js'

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url))

const CANDIDATES = [
  () => path.join(process.cwd(), 'plugins', 'miao-plugin', 'config', 'help.js'),
  () => path.join(SELF_DIR, '..', '..', 'miao-plugin', 'config', 'help.js')
]

let cache = null

/** 从 miao 帮助配置提取可点击命令并缓存 */
export async function loadMiaoCommands() {
  if (cache) return cache
  for (const make of CANDIDATES) {
    const file = make()
    if (!fs.existsSync(file)) continue
    try {
      const mod = await import(pathToFileURL(file).href)
      const list = extract(mod.helpList)
      if (list.length) {
        cache = list
        return cache
      }
    } catch (err) {
      Bot.makeLog('warn', `按钮插件读取 miao 帮助失败：${err?.message}`, false)
    }
  }
  cache = []
  return cache
}

/** 每个帮助条目取首个命令，过滤带占位数字与超长的 */
function extract(list) {
  const out = []
  for (const group of Array.isArray(list) ? list : []) {
    const groupName = group?.group ?? ''
    for (const item of group?.list ?? []) {
      const token = String(item?.title ?? '').trim().split(/\s+/)[0] ?? ''
      if (!/^[#*]/.test(token)) continue
      if (/\d{6,}/.test(token)) continue
      if (token.length > 12) continue
      if (out.some((i) => i.command === token)) continue
      out.push({ command: token, group: groupName, desc: item?.desc ?? '' })
    }
  }
  return out
}

export function miaoCount() {
  return cache?.length ?? 0
}

/** 按面板配置挑条目，extra 追加在末尾 */
export function pickEntries(panel) {
  const pool = cache ?? []
  const scoped = panel.groups.length ? pool.filter((item) => panel.groups.includes(item.group)) : pool
  const extra = panel.extra.filter((cmd) => !scoped.some((item) => item.command === cmd))
  const room = Math.max(panel.limit - extra.length, 0)
  const picked = scoped.slice(0, room).map((item) => ({ title: labelOf(item.command), data: item.command }))
  for (const cmd of extra) {
    if (picked.length >= panel.limit) break
    picked.push({ title: labelOf(cmd), data: cmd })
  }
  return picked
}
