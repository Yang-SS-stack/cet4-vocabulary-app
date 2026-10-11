const inset = 8
const clamp = (value, min, max) => Math.min(Math.max(value, min), max)
export const assistantViewport = () => ({ width: window.innerWidth, height: window.innerHeight })
export function clampWindow(rect, viewport) {
  const width = clamp(rect.width, Math.min(320, viewport.width - inset * 2), viewport.width - inset * 2)
  const height = clamp(rect.height, Math.min(360, viewport.height - inset * 2), viewport.height - inset * 2)
  return { x: clamp(rect.x, inset, viewport.width - width - inset), y: clamp(rect.y, inset, viewport.height - height - inset), width, height }
}
export function resizeWindow(rect, dx, dy, viewport) {
  return clampWindow({ ...rect, width: clamp(rect.width + dx, Math.min(320, viewport.width - rect.x - inset), viewport.width - rect.x - inset), height: clamp(rect.height + dy, Math.min(360, viewport.height - rect.y - inset), viewport.height - rect.y - inset) }, viewport)
}
export function clampLauncher(point, viewport, size = { width: 150, height: 48 }) {
  return { x: clamp(point.x, inset, Math.max(inset, viewport.width - size.width - inset)), y: clamp(point.y, inset, Math.max(inset, viewport.height - size.height - inset)) }
}
export const shouldDismissMobile = (delta, panelHeight) => panelHeight > 0 && delta > panelHeight / 2
