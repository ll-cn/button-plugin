const MAX_LABEL = 8

/** 命令转按钮标题 */
export function labelOf(cmd) {
  const text = String(cmd).replace(/^[#*／/]+/, '').trim()
  if (!text) return '按钮'
  return text.length > MAX_LABEL ? text.slice(0, MAX_LABEL) : text
}

/** 单个按钮：危险命令走指令按钮，其余走回调 */
function makeButton(cmd, danger, title) {
  const data = String(cmd)
  const isDanger = Boolean(danger?.test(data))
  return {
    title: title ?? labelOf(data),
    data,
    type: isDanger ? 'command' : 'call',
    options: { style: isDanger ? 'red' : 'blue' }
  }
}

/** 配置里的行式命令 → 按钮行 */
export function rowsFromStrings(rows, danger) {
  return rows.map((row) => row.map((cmd) => makeButton(cmd, danger)))
}

/** 条目按列数折行 */
export function buildRows(entries, columns = 3, danger) {
  const rows = []
  for (let i = 0; i < entries.length; i += columns) {
    rows.push(entries.slice(i, i + columns).map((entry) => makeButton(entry.data, danger, entry.title)))
  }
  return rows
}
