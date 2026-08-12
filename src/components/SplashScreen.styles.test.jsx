import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

const styles = readFileSync(resolve(process.cwd(), 'src', 'components', 'SplashScreen.css'), 'utf8')

test('gives the completed welcome copy a more spacious vertical rhythm', () => {
  expect(styles).toContain('gap: 34px')
  expect(styles).toContain('margin-bottom: clamp(48px, 10vh, 92px)')
  expect(styles).toContain('font-size: clamp(24px, 3.1vw, 38px)')
  expect(styles).toContain('top: -74px')
})
