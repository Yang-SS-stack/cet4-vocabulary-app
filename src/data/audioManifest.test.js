import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

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
