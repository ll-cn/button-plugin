import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_DIR = path.join(SELF_DIR, '..', 'config')
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.yaml')

const DEFAULT_TEXT = `# 按钮插件配置
enable: true
onlyGroup: false

# 命中的命令不挂按钮，例：["抽卡|十连|百连"]
exclude: []

# 危险命令用指令按钮：点了只填入输入框，需自己发送
danger: "^#?(删除|解绑|清除|重置)"

# 没有专门面板时，给带图的回复挂这套
default:
  enable: true
  rows:
    - ["#面板", "#更新面板"]
    - ["#体力", "#签到", "#帮助"]

# 专门面板：match 命中时替换默认键盘
panels:
  - match: "^#?(帮助|help|菜单|功能)$"
    source: miao
    groups: ["游戏面板与信息查询", "个人信息查询及签到"]
    extra: ["#更新面板", "#练度统计", "#今日素材"]
    limit: 15
    columns: 3
  - match: "扫码|绑定uid|绑定ck"
    rows:
      - ["#更新面板", "#绑定uid"]
      - ["#签到", "#帮助"]
`

let cache = null
let stamp = ''

/** 配置缺失时写入默认文件 */
export function ensureConfig() {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
    if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, DEFAULT_TEXT)
  } catch (err) {
    Bot.makeLog('error', `按钮插件写入默认配置失败：${err?.message}`, false)
  }
}

function toRe(value) {
  if (value instanceof RegExp) return value
  if (!value) return null
  try {
    return new RegExp(String(value))
  } catch {
    return null
  }
}

function toRows(rows) {
  if (!Array.isArray(rows)) return []
  return rows
    .map((row) => (Array.isArray(row) ? row : [row]))
    .map((row) => row.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()))
    .filter((row) => row.length)
}

function normalize(raw) {
  const def = raw?.default ?? {}
  const panels = (Array.isArray(raw?.panels) ? raw.panels : [])
    .map((panel) => ({
      re: toRe(panel?.match),
      source: panel?.source === 'miao' ? 'miao' : '',
      groups: Array.isArray(panel?.groups) ? panel.groups.filter((g) => typeof g === 'string') : [],
      extra: Array.isArray(panel?.extra) ? panel.extra.filter((i) => typeof i === 'string') : [],
      limit: Math.min(Math.max(Number(panel?.limit) || 15, 1), 25),
      columns: Math.min(Math.max(Number(panel?.columns) || 3, 1), 5),
      rows: toRows(panel?.rows)
    }))
    .filter((panel) => panel.re)

  return {
    enable: raw?.enable !== false,
    onlyGroup: raw?.onlyGroup === true,
    exclude: (Array.isArray(raw?.exclude) ? raw.exclude : []).map(toRe).filter(Boolean),
    danger: toRe(raw?.danger) ?? toRe('^#?(删除|解绑|清除|重置)'),
    default: { enable: def.enable !== false, rows: toRows(def.rows) },
    panels
  }
}

/** 读配置，文件变化后自动重载 */
export function loadConfig(force = false) {
  let stat = null
  try {
    stat = fs.statSync(CONFIG_FILE)
  } catch {}
  const next = stat ? `${stat.mtimeMs}:${stat.size}` : ''
  if (!force && cache && next === stamp) return cache
  stamp = next
  let raw = {}
  if (stat) {
    try {
      raw = YAML.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) ?? {}
    } catch (err) {
      Bot.makeLog('error', `按钮插件配置解析失败，沿用上一份：${err?.message}`, false)
      if (cache) return cache
    }
  }
  cache = normalize(raw)
  return cache
}

export function getConfig() {
  return cache ?? loadConfig()
}
