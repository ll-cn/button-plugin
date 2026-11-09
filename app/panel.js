import plugin from '../../../lib/plugins/plugin.js'
import { getConfig, CONFIG_FILE } from '../model/config.js'
import { rowsFromStrings, buildRows } from '../model/rows.js'
import { pickEntries, miaoCount, miaoSource, loadMiaoCommands } from '../model/help.js'
import { PLUGIN_NAME, VERSION, versionLine } from '../model/version.js'
import { updatePlugin, replyChangelog } from '../model/update.js'
import { bridgePatched, resolveImageMode } from '../model/bridge.js'

export default class ButtonPanel extends plugin {
  constructor() {
    super({
      name: '按钮面板',
      dsc: '给已有命令的回复挂按钮，点一下直接执行',
      event: 'message',
      priority: 15,
      rule: [
        { reg: /^[#＃/／]?\s*按钮插件(更新日志|更新说明|changelog)$/i, fnc: 'changelog' },
        { reg: /^[#＃/／]?\s*按钮插件强制更新$/i, fnc: 'forceUpdate' },
        { reg: /^[#＃/／]?\s*按钮插件(更新|升级|update)$/i, fnc: 'update' },
        { reg: /^[#＃/／]?\s*按钮(帮助|面板|菜单)$/, fnc: 'panel' },
        { reg: /^[#＃/／]?\s*按钮状态$/, fnc: 'status' }
      ]
    })
  }

  /** 入口面板：自动取 miao 帮助里的常用命令 */
  async panel() {
    const cfg = getConfig()
    await loadMiaoCommands()
    const auto = cfg.panels.find((item) => item.source === 'miao')
    const entries = auto ? pickEntries(auto) : []
    const rows = entries.length ? buildRows(entries, auto.columns, cfg.danger) : rowsFromStrings(cfg.default.rows, cfg.danger)
    const count = entries.length || cfg.default.rows.flat().length
    await this.reply([`点按钮直接执行（共 ${count} 个）\n更多命令发送 #帮助 查看\n\n${versionLine()}`, segment.button(...rows)])
    return true
  }

  /** 输出运行状态，便于排查 */
  async status() {
    const cfg = getConfig()
    const match = cfg.panels.map((item) => item.re.source).join(' / ') || '无'
    const lines = [
      `${PLUGIN_NAME} v${VERSION}`,
      `总开关：${cfg.enable ? '开' : '关'}`,
      `默认键盘：${cfg.default.enable ? `${cfg.default.rows.length} 行` : '关'}`,
      `图片模式：${resolveImageMode(cfg.imageMode)}（配置 ${cfg.imageMode}）`,
      `桥图片补丁：${bridgePatched() === true ? '已打' : bridgePatched() === false ? '未打' : '未找到桥文件'}`,
      `文字转按钮：${cfg.autoFromText ? `开，最多 ${cfg.maxAuto} 个` : '关'}`,
      `按钮升级：${cfg.upgradeButtons ? '开' : '关'}`,,
      `专门面板：${cfg.panels.length} 个`,
      `面板匹配：${match}`,
      `miao 帮助条目：${miaoCount()}${miaoSource() ? '' : '（没找到 help.js）'}`,
      `帮助来源：${miaoSource() || '无'}`,
      `配置：${CONFIG_FILE}`,
      '',
      versionLine()
    ]
    await this.reply(lines.join('\n'))
    return true
  }

  /** #按钮插件更新 */
  async update() {
    return updatePlugin(this.e, false)
  }

  /** #按钮插件强制更新 */
  async forceUpdate() {
    return updatePlugin(this.e, true)
  }

  /** #按钮插件更新日志 */
  async changelog() {
    return replyChangelog(this.e)
  }
}
