import { execFileSync } from 'node:child_process'
import { normalizeBuildInfo } from '../src/data/buildInfo.js'

export function readBuildInfo({ cwd = process.cwd(), now = new Date() } = {}) {
  function git(args) {
    try {
      return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
      }).trim()
    } catch {
      return null
    }
  }

  const status = git(['status', '--porcelain=v1', '--untracked-files=normal'])
  return normalizeBuildInfo({
    branch: git(['symbolic-ref', '--quiet', '--short', 'HEAD']),
    commit: git(['rev-parse', '--verify', 'HEAD']),
    builtAt: now.toISOString(),
    dirty: status === null ? null : status.length > 0,
  })
}
