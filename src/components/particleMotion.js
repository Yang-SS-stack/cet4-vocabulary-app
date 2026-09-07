export const TRANSITION_DURATION = 1580

const clamp = value => Math.min(1, Math.max(0, value))
const smooth = value => value * value * value * (value * (value * 6 - 15) + 10)

// A seeded generator gives reproducible motion without spatial stripes or rows.
function randomSequence(seed) {
  let state = seed + 1
  return () => {
    state += 0x6D2B79F5
    let value = Math.imul(state ^ state >>> 15, 1 | state)
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

export function createMotion(source, target, seed, width, height) {
  const random = randomSequence(seed)
  const angle = random() * Math.PI * 2
  const radius = (0.13 + random() * 0.3) * Math.min(width, height)
  const scatterDelay = random() * 65
  const scatterDuration = 280 + random() * 180
  return {
    startX: source.x, startY: source.y,
    scatterX: Math.max(12, Math.min(width - 12, source.x + Math.cos(angle) * radius)),
    scatterY: Math.max(12, Math.min(height - 12, source.y + Math.sin(angle) * radius)),
    targetX: target.x, targetY: target.y,
    scatterDelay, scatterDuration,
    gatherStart: scatterDelay + scatterDuration,
    gatherDuration: 570 + random() * 270,
    bendX: (random() - 0.5) * radius * 0.55,
    bendY: (random() - 0.5) * radius * 0.55,
    size: 0.8 + random() * 0.8,
    gold: random() < 0.06,
  }
}

export function positionAt(particle, elapsed) {
  const gathering = elapsed >= particle.gatherStart
  const progress = clamp(gathering
    ? (elapsed - particle.gatherStart) / particle.gatherDuration
    : (elapsed - particle.scatterDelay) / particle.scatterDuration)
  const eased = smooth(progress)
  const fromX = gathering ? particle.scatterX : particle.startX
  const fromY = gathering ? particle.scatterY : particle.startY
  const toX = gathering ? particle.targetX : particle.scatterX
  const toY = gathering ? particle.targetY : particle.scatterY
  // Each particle bends independently; endpoints and endpoint velocities stay continuous.
  const bend = 16 * progress * progress * (1 - progress) * (1 - progress)
  return {
    x: fromX + (toX - fromX) * eased + particle.bendX * bend,
    y: fromY + (toY - fromY) * eased + particle.bendY * bend,
  }
}
