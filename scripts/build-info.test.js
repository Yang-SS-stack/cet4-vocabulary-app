import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as buildInfo from './build-info.mjs'
const temporaryRoot = realpathSync(tmpdir())
const directories = []
const now = new Date('2026-10-05T00:00:00.000Z')

function temporaryDirectory() {
  const directory = mkdtempSync(join(temporaryRoot, 'linguajet-build-info-'))
  directories.push(directory)
  return directory
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function read(options) {
  expect(buildInfo.readBuildInfo).toBeTypeOf('function')
  return buildInfo.readBuildInfo(options)
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    const resolved = realpathSync(directory)
    if (!resolved.startsWith(`${temporaryRoot}${sep}linguajet-build-info-`)) throw new Error('Unexpected temporary directory')
    rmSync(resolved, { recursive: true, force: true })
  }
})

describe('build-time Git metadata', () => {
  it('reads branch and commit with a clean working tree', () => {
    const cwd = temporaryDirectory()
    git(cwd, ['init', '--initial-branch=test/public-build'])
    git(cwd, ['-c', 'user.name=Build Metadata Test', '-c', 'user.email=build-test@example.invalid', 'commit', '--allow-empty', '-m', 'test fixture'])
    expect(read({ cwd, now })).toEqual({ branch: 'test/public-build', commit: git(cwd, ['rev-parse', 'HEAD']), builtAt: now.toISOString(), dirty: false })
  })

  it('marks untracked working-tree changes as dirty', () => {
    const cwd = temporaryDirectory()
    git(cwd, ['init', '--initial-branch=test/public-build'])
    git(cwd, ['-c', 'user.name=Build Metadata Test', '-c', 'user.email=build-test@example.invalid', 'commit', '--allow-empty', '-m', 'test fixture'])
    writeFileSync(join(cwd, 'untracked.txt'), 'changed')
    expect(read({ cwd, now }).dirty).toBe(true)
  })

  it('keeps unavailable Git metadata unknown without failing the build', () => {
    expect(read({ cwd: temporaryDirectory(), now })).toEqual({ branch: null, commit: null, builtAt: now.toISOString(), dirty: null })
  })

  it('generates the build time from the current clock by default', () => {
    const before = Date.now()
    const result = read({ cwd: temporaryDirectory() })
    expect(Date.parse(result.builtAt)).toBeGreaterThanOrEqual(before)
    expect(Date.parse(result.builtAt)).toBeLessThanOrEqual(Date.now())
  })
})
