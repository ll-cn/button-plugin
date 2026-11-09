import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { labelOf } from './rows.js'

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url))

const CANDIDATES = [
  () => path.join(process.cwd(), 'plugins', 'miao-plugin', 'config', 'help.js'),
  () => path.join(process.cwd(), 'Yunzai', 'plugins', 'miao-plugin', 'config', 'help.js'),
  () => path.join(SELF_DIR, '..', '..', 'miao-plugin', 'config', 'help.js'),
  () => path.join(SELF_DIR, '..', '..', '..', 'miao-plugin', 'config', 'help.js')
]

let cache = null
let loadedFrom = ''
let checkedAt = 0

/** 从 miao 帮助配置提取可点击命令并缓存 */
export async function loadMiaoCommands(force = false) {
  if (!force) {
    if (cache?.length) return cache
    if (cache && Date.now() - checkedAt < 60000) return cache
  }
  checkedAt = Date.now()
  cache = []
  loadedFrom = ''
  for (const make of CANDIDATES) {
    const file = make()
    if (!fs.existsSync(file)) continue
    try {
      const mod = await import(pathToFileURL(file).href)
      const list = extract(mod.helpList)
      if (list.length) {
        cache = list
        loadedFrom = file
        return cache
      }
    } catch (err) {
      Bot.makeLog('warn', `按钮插件读取 miao 帮助失败：${err?.message}`, false)
    }
  }
  return cache
}

/** 帮助配置的来源文件，便于排查 */
export function miaoSource() {
  return loadedFrom
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

const PLUGIN_ROOTS = [
  path.resolve(SELF_DIR, '..', '..'),
  path.join(process.cwd(), 'plugins'),
  path.join(process.cwd(), 'Yunzai', 'plugins')
]

const fileCache = new Map()
const keywordCache = new Map()

/** 插件根目录候选（存在才算） */
function pluginRoots() {
  return [...new Set(PLUGIN_ROOTS)].filter((dir) => {
    try {
      return fs.statSync(dir).isDirectory()
    } catch {
      return false
    }
  })
}

/** 列出目录下名字含 help 的脚本 */
function helpFilesOf(dir) {
  const out = []
  for (const sub of ['', 'apps', 'config']) {
    const target = sub ? path.join(dir, sub) : dir
    let entries = []
    try {
      entries = fs.readdirSync(target, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(js|mjs|cjs|json|ya?ml)$/i.test(entry.name)) continue
      if (!/help/i.test(entry.name)) continue
      out.push(path.join(target, entry.name))
    }
  }
  return out
}

/** 从帮助文件文本里提取 #命令 */
function commandsOf(file) {
  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    return []
  }
  const hit = fileCache.get(file)
  if (hit && hit.mtime === stat.mtimeMs && hit.size === stat.size) return hit.commands

  let text = ''
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const commands = []
  for (const match of text.matchAll(/[#＃*＊][\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9_]{1,11}/g)) {
    const cmd = match[0].replace(/^[＃＊]/, (c) => (c === '＃' ? '#' : '*'))
    if (/\d{6,}/.test(cmd) || commands.includes(cmd)) continue
    commands.push(cmd)
  }
  fileCache.set(file, { mtime: stat.mtimeMs, size: stat.size, commands })
  return commands
}

/** 命令里的关键词：去掉前缀与「帮助」后缀 */
export function keywordOf(text) {
  return String(text ?? '')
    .replace(/^[#＃*＊/／\s]+/, '')
    .replace(/(帮助|菜单|功能|help)$/i, '')
    .trim()
}

/** 按关键词找对应插件的帮助文件 */
function findHelpFile(keyword) {
  if (!keyword) return null
  const roots = pluginRoots()
  let best = null
  for (const root of roots) {
    let dirs = []
    try {
      dirs = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    } catch {
      continue
    }
    for (const dir of dirs) {
      if (dir.name === 'button-plugin' || dir.name === 'node_modules') continue
      const full = path.join(root, dir.name)
      for (const file of helpFilesOf(full)) {
        const commands = commandsOf(file)
        if (!commands.length) continue
        let score = 0
        if (dir.name.includes(keyword)) score += 5
        try {
          const text = fs.readFileSync(file, 'utf8')
          score += text.split(keyword).length - 1
        } catch {
          continue
        }
        if (score > 0 && (!best || score > best.score)) best = { file, dir: dir.name, score, commands }
      }
    }
  }
  return best
}

/** 按命令关键词自动提取对应插件的帮助命令 */
export function autoEntries(text, limit = 15) {
  const keyword = keywordOf(text)
  if (!keyword) return []
  const cached = keywordCache.get(keyword)
  if (cached && Date.now() - cached.at < 300000) return cached.entries.slice(0, limit)

  const hit = findHelpFile(keyword)
  let commands = hit?.commands ?? []
  if (hit?.dir === 'miao-plugin' && cache?.length) commands = cache.map((item) => item.command)

  const entries = commands.map((cmd) => ({ title: labelOf(cmd), data: cmd }))
  keywordCache.set(keyword, { at: Date.now(), entries })
  return entries.slice(0, limit)
}

/** 指定插件目录提取帮助命令 */
export function pluginEntries(dirName, limit = 15) {
  for (const root of pluginRoots()) {
    const full = path.join(root, dirName)
    try {
      if (!fs.statSync(full).isDirectory()) continue
    } catch {
      continue
    }
    const commands = []
    for (const file of helpFilesOf(full)) {
      for (const cmd of commandsOf(file)) if (!commands.includes(cmd)) commands.push(cmd)
    }
    if (commands.length) return commands.slice(0, limit).map((cmd) => ({ title: labelOf(cmd), data: cmd }))
  }
  return []
}

/** 按面板配置挑条目，extra 追加在末尾 */
export function pickEntries(panel) {
  const pool = cache ?? []
  const scopedAll = panel.groups.length ? pool.filter((item) => panel.groups.includes(item.group)) : pool
  const scoped = scopedAll.length ? scopedAll : pool
  const extra = panel.extra.filter((cmd) => !scoped.some((item) => item.command === cmd))
  const room = Math.max(panel.limit - extra.length, 0)
  const picked = scoped.slice(0, room).map((item) => ({ title: labelOf(item.command), data: item.command }))
  for (const cmd of extra) {
    if (picked.length >= panel.limit) break
    picked.push({ title: labelOf(cmd), data: cmd })
  }
  return picked
}
