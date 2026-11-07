import { getConfig } from '../model/config.js'
import { rowsFromStrings, buildRows } from '../model/rows.js'
import { pickEntries } from '../model/help.js'

const MARK = Symbol('btnDecorated')
const PASSTHROUGH = new Set(['record', 'video', 'forward', 'node', 'button'])

/** 消息里是否含图片 */
function hasImage(msg) {
  if (!msg) return false
  if (Buffer.isBuffer(msg)) return true
  if (Array.isArray(msg)) return msg.some((seg) => seg?.type === 'image' || seg?.type === 'flash')
  return msg?.type === 'image' || msg?.type === 'flash'
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
function planRows(cfg, text) {
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

/** 决定这条回复挂什么键盘 */
function decorate(cfg, msg, fixed) {
  if (hasButton(msg)) return msg
  if (fixed) return attach(msg, fixed)
  if (!cfg.default.enable || !cfg.default.rows.length) return msg
  if (!hasImage(msg)) return msg
  return attach(msg, rowsFromStrings(cfg.default.rows, cfg.danger))
}

function patch(holder, key, fn) {
  const orig = holder?.[key]
  if (typeof orig !== 'function' || orig[MARK]) return
  const wrapped = function (msg, quote) {
    let next = msg
    try {
      next = fn(msg)
    } catch {}
    return orig.call(this, next, quote)
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
  const fixed = planRows(cfg, text)
  if (!fixed && !cfg.default.enable) return
  const fn = (msg) => decorate(cfg, msg, fixed)
  patch(e, 'reply', fn)
  patch(e.group, 'sendMsg', fn)
  patch(e.friend, 'sendMsg', fn)
}

export function registerDecorator() {
  if (globalThis.__buttonPluginDecorator) return
  globalThis.__buttonPluginDecorator = true
  Bot.on('message', onMessage)
}
