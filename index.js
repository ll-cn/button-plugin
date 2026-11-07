import { ensureConfig, loadConfig } from './model/config.js'
import { loadMiaoCommands } from './model/help.js'
import { registerDecorator } from './app/decorate.js'
import { PLUGIN_NAME, VERSION } from './model/version.js'

export { default as ButtonPanel } from './app/panel.js'
export { VERSION }

ensureConfig()
loadConfig()
try {
  await loadMiaoCommands()
} catch {}
registerDecorator()

try {
  Bot.makeLog('mark', `[${PLUGIN_NAME} v${VERSION}] 已加载`, false)
} catch {}
