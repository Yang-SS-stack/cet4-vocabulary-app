import { useEffect, useRef } from 'react'
import { createMotion, positionAt, TRANSITION_DURATION, LOGO_REVEAL_AT } from './particleMotion'
import './ParticleTextTransition.css'

const MAX_PARTICLES = 1800

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum)

function fontFromSnapshot(snapshot) {
  return `${snapshot.fontWeight} ${snapshot.fontSize}px ${snapshot.fontFamily}`
}

function wrapText(context, text, width) {
  const lines = []
  let line = ''

  for (const character of [...text]) {
    const nextLine = `${line}${character}`
    if (line && context.measureText(nextLine).width > width) {
      lines.push(line)
      line = character
    } else {
      line = nextLine
    }
  }

  if (line) lines.push(line)
  return lines
}

function sampleText(snapshot) {
  const width = Math.max(1, Math.ceil(snapshot.rect.width))
  const height = Math.max(1, Math.ceil(snapshot.rect.height))
  const sampleCanvas = document.createElement('canvas')
  const context = sampleCanvas.getContext('2d', { willReadFrequently: true })
  if (!context) return []

  sampleCanvas.width = width
  sampleCanvas.height = height
  context.clearRect(0, 0, width, height)
  context.font = fontFromSnapshot(snapshot)
  context.fillStyle = '#ffffff'
  context.textAlign = snapshot.textAlign === 'left' || snapshot.textAlign === 'start'
    ? 'left'
    : 'center'
  context.textBaseline = 'alphabetic'

  if (snapshot.lineBoxBaseline) {
    const metrics = context.measureText(snapshot.text)
    const ascent = metrics.actualBoundingBoxAscent || snapshot.fontSize * 0.78
    const descent = metrics.actualBoundingBoxDescent || snapshot.fontSize * 0.22
    const baseline = Math.max(ascent, (height - ascent - descent) / 2 + ascent)

    context.fillText(
      snapshot.text,
      0,
      baseline,
    )
  } else {
    const lineHeight = Math.max(snapshot.fontSize * 1.18, snapshot.lineHeight)
    const lines = wrapText(context, snapshot.text, width * 0.96)
    const totalHeight = lines.length * lineHeight
    const startY = Math.max(snapshot.fontSize, (height - totalHeight) / 2 + snapshot.fontSize)
    const x = context.textAlign === 'left' ? width * 0.02 : width / 2

    lines.forEach((line, index) => {
      context.fillText(line, x, startY + index * lineHeight)
    })
  }

  const pixels = context.getImageData(0, 0, width, height).data
  const points = []
  const step = 3

  for (let y = 0; y < height; y += step) {
    for (let xPosition = 0; xPosition < width; xPosition += step) {
      if (pixels[(y * width + xPosition) * 4 + 3] > 42) {
        points.push({
          x: snapshot.rect.left + xPosition,
          y: snapshot.rect.top + y,
          color: snapshot.color,
        })
      }
    }
  }

  return points
}

function limitParticles(points) {
  const stride = Math.max(1, Math.ceil(points.length / MAX_PARTICLES))
  return points.filter((_, index) => index % stride === 0)
}

function ParticleTextTransition({
  sourceTexts,
  targetElement,
  onSourceRelease,
  onScatterComplete,
  onLogoReveal,
  onComplete,
}) {
  const canvasRef = useRef(null)
  const completeRef = useRef(false)
  const sourceReleasedRef = useRef(false)
  const scatterCompleteRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !targetElement) return undefined

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      onComplete()
      return undefined
    }

    const context = canvas.getContext('2d')
    if (!context) {
      onComplete()
      return undefined
    }

    const targetStyles = window.getComputedStyle(targetElement)
    const targetRect = targetElement.getBoundingClientRect()
    const targetPoints = sampleText({
      text: targetElement.textContent ?? '',
      rect: targetRect,
      color: targetStyles.color,
      fontFamily: targetStyles.fontFamily,
      fontWeight: targetStyles.fontWeight,
      fontSize: parseFloat(targetStyles.fontSize),
      lineHeight: parseFloat(targetStyles.lineHeight) || parseFloat(targetStyles.fontSize) * 1.2,
      textAlign: 'left',
      lineBoxBaseline: true,
    })
    const sourcePoints = limitParticles(sourceTexts.flatMap(sampleText))
    if (!sourcePoints.length || !targetPoints.length) {
      onComplete()
      return undefined
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = window.innerWidth
    const height = window.innerHeight
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    context.setTransform(dpr, 0, 0, dpr, 0, 0)

    const particles = sourcePoints.map((point, index) => {
      const target = targetPoints[(index * 37) % targetPoints.length]
      return {
        ...createMotion(point, target, index, width, height),
        x: point.x,
        y: point.y,
      }
    })

    let frame = 0
    const startedAt = performance.now()
    let previousTime = startedAt
    let logoRevealed = false

    const draw = (now) => {
      const elapsed = now - startedAt
      const follow = 1 - Math.exp(-Math.max(0, now - previousTime) / 38)
      previousTime = now
      const fade = 1 - clamp((elapsed - LOGO_REVEAL_AT) / (TRANSITION_DURATION - LOGO_REVEAL_AT), 0, 1)

      context.clearRect(0, 0, width, height)
      particles.forEach((particle) => {
        const position = positionAt(particle, elapsed)
        particle.x += (position.x - particle.x) * follow
        particle.y += (position.y - particle.y) * follow
        context.fillStyle = particle.gold && elapsed < 1000 ? '#96762e' : targetStyles.color
        context.globalAlpha = fade * (0.65 + 0.35 * clamp(elapsed / 1100, 0, 1))
        context.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size)
      })
      context.globalAlpha = 1

      if (!sourceReleasedRef.current) {
        sourceReleasedRef.current = true
        onSourceRelease?.()
      }

      if (elapsed >= 350 && !scatterCompleteRef.current) {
        scatterCompleteRef.current = true
        onScatterComplete?.()
      }

      if (elapsed >= LOGO_REVEAL_AT && !logoRevealed) {
        logoRevealed = true
        onLogoReveal?.()
      }

      if (elapsed < TRANSITION_DURATION) {
        frame = window.requestAnimationFrame(draw)
      } else if (!completeRef.current) {
        completeRef.current = true
        onComplete()
      }
    }

    completeRef.current = false
    sourceReleasedRef.current = false
    scatterCompleteRef.current = false
    frame = window.requestAnimationFrame(draw)
    // Finish cleanly if the destination moves or the tab stops producing frames.
    const finish = () => {
      if (completeRef.current) return
      completeRef.current = true
      window.cancelAnimationFrame(frame)
      onComplete()
    }
    const onVisibilityChange = () => { if (document.hidden) finish() }
    window.addEventListener('resize', finish)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', finish)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [onComplete, onScatterComplete, onSourceRelease, onLogoReveal, sourceTexts, targetElement])

  return (
    <div className="particle-text-transition" data-testid="particle-text-transition" aria-hidden="true">
      <canvas ref={canvasRef} className="particle-text-transition__canvas" />
    </div>
  )
}

export default ParticleTextTransition
