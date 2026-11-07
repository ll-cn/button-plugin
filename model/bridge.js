import fs from 'node:fs'
import path from 'node:path'

const RELS = ['node_modules/alemonjs-load-yunzai/lib/yunzai/bridge.js', 'packages/alemonjs-load-yunzai/lib/yunzai/bridge.js']

let cached

/** 桥接层是否已加图片尺寸补丁（markdown 图片带 #0 #0） */
export function bridgePatched() {
  if (cached !== undefined) return cached
  const roots = [process.cwd(), path.resolve(process.cwd(), '..')]
  for (const root of roots) {
    for (const rel of RELS) {
      try {
        const code = fs.readFileSync(path.join(root, rel), 'utf8')
        if (code.includes('prepared.references')) {
          cached = code.includes('图片 #0 #0](')
          return cached
        }
      } catch {}
    }
  }
  cached = null
  return cached
}

/** 实际使用的图片模式：auto 时按桥是否打补丁决定 */
export function resolveImageMode(mode) {
  if (mode === 'merge' || mode === 'split') return mode
  return bridgePatched() === true ? 'merge' : 'split'
}
