import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { loadAudioManifest, resolveAudioPath } from './audioManifest'

const manifest = JSON.parse(readFileSync('src/data/audioManifest.json', 'utf8'))

test('audio manifest records the approved voices and every vocabulary audio file', () => {
  expect(manifest.rate).toBe('-10%')
  expect(manifest.voices).toEqual({ 'en-GB': 'en-GB-SoniaNeural', 'en-US': 'en-US-JennyNeural' })
  expect(Object.keys(manifest.words)).toHaveLength(4544)
  for (const [word, files] of Object.entries(manifest.words)) {
    expect(files['en-GB'], word).toMatch(/^\/audio\/sonia-jenny\/words\/en-GB\/[a-z-']+\.mp3$/)
    expect(files['en-US'], word).toMatch(/^\/audio\/sonia-jenny\/words\/en-US\/[a-z-']+\.mp3$/)
    expect(files.example, word).toMatch(/^\/audio\/sonia-jenny\/examples\/en-US\/[a-f0-9]{20}\.mp3$/)
    expect(existsSync(join(process.cwd(), 'public', files['en-GB'].slice(1))), word).toBe(true)
    expect(existsSync(join(process.cwd(), 'public', files['en-US'].slice(1))), word).toBe(true)
    expect(existsSync(join(process.cwd(), 'public', files.example.slice(1))), word).toBe(true)
  }
})

test('adds the GitHub Pages base path to an audio URL', () => {
  expect(resolveAudioPath('/audio/sonia-jenny/words/en-US/apple.mp3', '/cet4-vocabulary-app/'))
    .toBe('/cet4-vocabulary-app/audio/sonia-jenny/words/en-US/apple.mp3')
})

test('keeps local audio URLs rooted at the local site', () => {
  expect(resolveAudioPath('/audio/sonia-jenny/words/en-US/apple.mp3', '/'))
    .toBe('/audio/sonia-jenny/words/en-US/apple.mp3')
})

test('loads the manifest lazily and reuses the resolved result', async () => {
  const first = await loadAudioManifest()
  const second = await loadAudioManifest()

  expect(second).toBe(first)
  expect(first.words.apple['en-GB']).toMatch(/^\/audio\/sonia-jenny\/words\/en-GB\/apple\.mp3$/)
})
