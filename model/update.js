import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { PLUGIN_ROOT, PLUGIN_NAME, VERSION, REPO_URL, versionLine } from './version.js'

const run = promisify(execFile)

let updating = false

/** 执行 git 并返回 stdout */
async function git(args, timeout = 60000) {
  const { stdout } = await run('git', args, { cwd: PLUGIN_ROOT, timeout })
  return String(stdout ?? '').trim()
}

async function shortRev() {
  try {
    return await git(['rev-parse', '--short', 'HEAD'], 15000)
  } catch {
    return ''
  }
}

/** 把 git 报错翻成人话 */
function failureReason(detail) {
  const hit = [
    [/Your local changes|would be overwritten|Please commit your changes|not possible to fast-forward|diverged|rejected/i, '本地文件有改动，和远程冲突了'],
    [/not a git repository/i, '插件不是用 git 克隆安装的'],
    [/CONFLICT|merge conflict/i, '合并冲突'],
    [/Could not resolve host|unable to access|Connection timed out|Failed to connect|over proxy/i, '连不上 GitHub，检查代理'],
    [/Authentication failed|could not read Username|Permission denied/i, '没有仓库权限']
  ]
  for (const [re, text] of hit) if (re.test(detail)) return text
  return 'git 返回了错误'
}

/** 更新插件，force 表示丢弃本地改动 */
export async function updatePlugin(e, force = false) {
  if (updating) {
    await e.reply('正在更新中，请稍候再试。')
    return true
  }

  if (!fs.existsSync(path.join(PLUGIN_ROOT, '.git'))) {
    await e.reply(
      [
        '😵 这个插件不是用 git 克隆安装的，没法自动更新。',
        `插件目录：${PLUGIN_ROOT}`,
        '',
        '重装一次就能用更新命令了：',
        `  git clone ${REPO_URL} "${path.join('plugins', PLUGIN_NAME)}"`
      ].join('\n')
    )
    return true
  }

  updating = true
  try {
    const before = await shortRev()
    if (force) {
      const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], 15000)) || 'main'
      await run('git', ['fetch', '--all', '--prune'], { cwd: PLUGIN_ROOT, timeout: 60000 })
      await run('git', ['reset', '--hard', `origin/${branch}`], { cwd: PLUGIN_ROOT, timeout: 30000 })
    } else {
      await run('git', ['pull', '--ff-only'], { cwd: PLUGIN_ROOT, timeout: 60000 })
    }

    const after = await shortRev()
    if (!force && before && after && before === after) {
      await e.reply(['✅ 已是最新版本', versionLine()].join('\n'))
      return true
    }

    await e.reply(
      [
        `✅ ${force ? '已强制更新' : '更新完成'}`,
        `${before || '未知'} → ${after || '未知'}`,
        versionLine(),
        '',
        '发送 #yz重启 让新代码生效'
      ].join('\n')
    )
  } catch (err) {
    const detail = String(err?.stderr || err?.stdout || err?.message || err).trim()
    Bot.makeLog('error', `[${PLUGIN_NAME}] 更新失败：${detail.slice(0, 400)}`, false)
    await e.reply(
      [
        `😵 更新失败：${failureReason(detail)}`,
        '',
        detail.split('\n').slice(-3).join('\n'),
        '',
        '发送 #按钮插件强制更新 可丢弃本地改动'
      ].join('\n')
    )
  } finally {
    updating = false
  }
  return true
}

/** 发合并转发更新日志 */
export async function replyChangelog(e) {
  let lines = []
  try {
    const out = await git(['log', '-20', '--pretty=%h||[%cd] %s', '--date=format:%F %T'], 20000)
    lines = out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [, text] = line.split('||')
        return text ? text.trim() : ''
      })
      .filter((text) => text && !text.includes('Merge branch'))
  } catch {}

  if (!lines.length) {
    await e.reply('暂无更新记录（插件可能不是 git 安装）')
    return true
  }

  const msgs = [`${PLUGIN_NAME} v${VERSION} 更新日志`, lines.join('\n\n'), REPO_URL]
  try {
    await e.reply(Bot.makeForwardArray(msgs))
  } catch {
    await e.reply(msgs.join('\n'))
  }
  return true
}
