import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import viteConfig from '../../vite.config.js'
import * as buildInfo from './buildInfo.js'
const unknown = { branch: null, commit: null, builtAt: null, dirty: null }
const publicInfo = {
  branch: 'codex/development-maintenance',
  commit: 'a'.repeat(40),
  builtAt: '2026-10-05T00:00:00.000Z',
  dirty: false,
}

function normalize(value) {
  expect(buildInfo.normalizeBuildInfo).toBeTypeOf('function')
  return buildInfo.normalizeBuildInfo(value)
}

function readUnbundled(value) {
  expect(buildInfo.getBuildInfo).toBeTypeOf('function')
  const moduleUrl = pathToFileURL(join(process.cwd(), 'src/data/buildInfo.js')).href
  const assignment = value === undefined ? '' : `globalThis.__LINGUAJET_BUILD_INFO__ = ${JSON.stringify(value)};`
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
    `${assignment} const { getBuildInfo } = await import(${JSON.stringify(moduleUrl)}); console.log(JSON.stringify(getBuildInfo()));`,
  ], { encoding: 'utf8' }))
}

describe('public build metadata', () => {
  it('returns only the four approved public fields', () => {
    expect(normalize({ ...publicInfo, sessionToken: 'private-token', env: { SECRET: 'private-key' } })).toEqual(publicInfo)
  })

  it('uses null for unavailable or malformed values', () => {
    for (const value of [undefined, null, [], 'metadata', { branch: '', commit: 'not-a-commit', builtAt: 'tomorrow', dirty: 'false' }]) {
      expect(normalize(value)).toEqual(unknown)
    }
    expect(normalize({ branch: 'bad\nbranch', commit: 'a'.repeat(40), builtAt: '2026-02-30T00:00:00.000Z', dirty: true })).toEqual({
      ...unknown, commit: 'a'.repeat(40), dirty: true,
    })
  })

  it('returns unknown values when no compiled constant exists', () => {
    expect(readUnbundled()).toEqual(unknown)
  })

  it('reads and normalizes a present runtime constant', () => {
    expect(readUnbundled({ ...publicInfo, secret: 'private-token' })).toEqual(publicInfo)
  })

  it('defines only the approved build metadata for Vite', () => {
    expect(viteConfig.define?.__LINGUAJET_BUILD_INFO__).toBeTypeOf('string')
    expect(Object.keys(JSON.parse(viteConfig.define.__LINGUAJET_BUILD_INFO__)).sort()).toEqual(['branch', 'builtAt', 'commit', 'dirty'])
    expect(Object.keys(buildInfo.getBuildInfo()).sort()).toEqual(['branch', 'builtAt', 'commit', 'dirty'])
  })
})
