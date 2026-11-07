import { getConfig } from '../model/config.js'
import { rowsFromStrings, buildRows, commandsInText, labelOf } from '../model/rows.js'
import { pickEntries } from '../model/help.js'
import { resolveImageMode } from '../model/bridge.js'

const MARK = Symbol('btnDecorated')
const PASSTHROUGH = new Set(['record', 'video', 'forward', 'node', 'button'])
const MAX_ROWS = 5
const CALL_TYPES = new Set([0, 'call'])

function isImage(item) {
  return item?.type === 'image' || item?.type === 'flash' || Buffer.isBuffer(item)
}

/** 是否像一个按钮定义 */
function isButtonNode(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false
  const hasLabel = node.title !== undefined || node.label !== undefined || node.text !== undefined || node.value !== undefined
  const hasAction = node.data !== undefined || node.action !== undefined || node.callback !== undefined || node.link !== undefined || node.options !== undefined
  return hasLabel && hasAction
}

/** 把指令按钮改写成回调按钮，需要用户补参数的原样保留 */
function rewriteNode(node, keepInput) {
  if (Array.isArray(node)) return node.map((item) => rewriteNode(item, keepInput))
  if (node && typeof node === 'object' && Array.isArray(node.buttons)) {
    return { ...node, buttons: node.buttons.map((item) => rewriteNode(item, keepInput)) }
  }
  if (!isButtonNode(node)) return node

  const type = node.type ?? node.action?.type
  if (CALL_TYPES.has(type) || type === 1 || type === 'link' || node.link !== undefined) return node

  const data = String(node.data ?? node.action?.data ?? node.options?.data ?? node.callback ?? '')
  if (!data || /^https?:\/\//i.test(data) || keepInput.test(data)) return node
  return { ...node, data, type: 'call' }
}

/** 升级消息里其它插件写好的按钮 */
function upgradeButtons(msg, cfg) {
  if (!cfg.upgradeButtons) return msg
  if (Array.isArray(msg)) {
    if (!msg.some((seg) => seg?.type === 'button')) return msg
    return msg.map((seg) => (seg?.type === 'button' ? { ...seg, data: rewriteNode(seg.data, cfg.keepInput) } : seg))
  }
  if (msg?.type === 'button') return { ...msg, data: rewriteNode(msg.data, cfg.keepInput) }
  return msg
}

/** 消息里是否含图片 */
function hasImage(msg) {
  if (!msg) return false
  if (Buffer.isBuffer(msg)) return true
  if (Array.isArray(msg)) return msg.some(isImage)
  return isImage(msg)
}

/** 消息里是否已带按钮 */
function hasButton(msg) {
  return Array.isArray(msg) && msg.some((seg) => seg?.type === 'button')
}

/** 不能挂按钮的消息类型 */
function isPassthrough(item) {
  if (!item) return false
  return PASSTHROUGH.has(item?.type) || Boolean(item?.__forwardNodes ?? item?.__forwardParts)
}

/** 取消息里的文字部分 */
function textOf(msg) {
  if (typeof msg === 'string' || typeof msg === 'number') return String(msg)
  if (Array.isArray(msg)) return msg.filter((seg) => seg?.type === 'text').map((seg) => seg.text ?? seg.data ?? '').join(' ')
  if (msg?.type === 'text') return msg.text ?? msg.data ?? ''
  return ''
}

/** 把图片拆出来，其余内容留给按钮消息 */
function splitImage(msg) {
  if (Array.isArray(msg)) {
    const images = msg.filter(isImage)
    if (!images.length) return null
    return { images, rest: msg.filter((item) => !isImage(item)) }
  }
  if (isImage(msg)) return { images: [msg], rest: [] }
  return null
}

/** 在消息末尾追加键盘 */
function attach(msg, rows) {
  const btn = segment.button(...rows)
  if (Array.isArray(msg)) {
    if (msg.some(isPassthrough)) return msg
    return [...msg, btn]
  }
  if (typeof msg === 'string' || typeof msg === 'number') return [String(msg), btn]
  if (Buffer.isBuffer(msg)) return [segment.image(msg), btn]
  if (msg && typeof msg === 'object') {
    if (isPassthrough(msg)) return msg
    return [msg, btn]
  }
  return msg
}

/** 命中面板时返回该面板的按钮行 */
function panelRows(cfg, text) {
  for (const panel of cfg.panels) {
    if (!panel.re.test(text)) continue
    if (panel.source === 'miao') {
      const entries = pickEntries(panel)
      if (entries.length) return buildRows(entries, panel.columns, cfg.danger)
      if (panel.rows.length) return rowsFromStrings(panel.rows, cfg.danger)
      continue
    }
    if (panel.rows.length) return rowsFromStrings(panel.rows, cfg.danger)
  }
  return null
}

/** 把文本里出现的 #命令 追加成一行按钮 */
function appendAuto(cfg, rows, text) {
  if (!cfg.autoFromText || !text) return rows
  const used = new Set((rows ?? []).flat().map((item) => item.data))
  const commands = commandsInText(text, cfg.maxAuto).filter((cmd) => !used.has(cmd))
  if (!commands.length) return rows
  const auto = commands.map((cmd) => ({ title: labelOf(cmd), data: cmd }))
  if (!rows || !rows.length) return buildRows(auto, auto.length, cfg.danger)
  if (rows.length >= MAX_ROWS) return rows
  return [...rows, buildRows(auto, auto.length, cfg.danger)[0]]
}

/** 决定这条回复挂什么键盘，返回 null 表示不动 */
function plan(cfg, msg, fixed) {
  if (hasButton(msg)) return null
  if (Array.isArray(msg) && msg.some(isPassthrough)) return null
  if (isPassthrough(msg)) return null

  let rows = fixed
  if (!rows && cfg.default.enable && cfg.default.rows.length && hasImage(msg)) {
    rows = rowsFromStrings(cfg.default.rows, cfg.danger)
  }
  rows = appendAuto(cfg, rows, textOf(msg))
  if (!rows || !rows.length) return null
  return { rows, split: resolveImageMode(cfg.imageMode) === 'split' }
}

function patch(holder, key, fixed) {
  const orig = holder?.[key]
  if (typeof orig !== 'function' || orig[MARK]) return
  let splitUsed = 0
  const wrapped = async function (msg, quote) {
    const cfg = getConfig()
    let next = msg
    try {
      next = upgradeButtons(msg, cfg)
    } catch {}

    let planned = null
    try {
      planned = plan(cfg, next, fixed)
    } catch {}
    if (!planned) return orig.call(this, next, quote)

    if (planned.split && splitUsed > 0) return orig.call(this, next, quote)
    if (planned.split) splitUsed++

    const part = planned.split ? splitImage(next) : null
    if (!part) return orig.call(this, attach(next, planned.rows), quote)

    let first = null
    try {
      first = await orig.call(this, part.images.length === 1 ? part.images[0] : part.images, quote)
    } catch {}
    const tail = part.rest.length ? attach(part.rest, planned.rows) : segment.button(...planned.rows)
    const second = await orig.call(this, tail, false)
    return first ?? second
  }
  wrapped[MARK] = true
  try {
    holder[key] = wrapped
  } catch {}
}

/** 事件入口：先于规则接管所有回复出口 */
export function onMessage(e) {
  const cfg = getConfig()
  if (!cfg.enable || e?.post_type !== 'message') return
  if (cfg.onlyGroup && !e.isGroup) return
  const text = String(e.msg || e.raw_message || '').trim()
  if (!text) return
  if (cfg.exclude.some((re) => re.test(text))) return
  const fixed = panelRows(cfg, text)
  patch(e, 'reply', fixed)
  patch(e.group, 'sendMsg', fixed)
  patch(e.friend, 'sendMsg', fixed)
}

export function registerDecorator() {
  if (globalThis.__buttonPluginDecorator) return
  globalThis.__buttonPluginDecorator = true
  Bot.on('message', onMessage)
}
