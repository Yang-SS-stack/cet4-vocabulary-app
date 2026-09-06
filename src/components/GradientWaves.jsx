import { useEffect, useRef } from 'react'
import { Mesh, Program, Renderer, Triangle } from 'ogl'
import './GradientWaves.css'

const vertex = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`

const fragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uWaveScale;
uniform float uHeight;
uniform float uFogDepth;
uniform float uOpacity;
uniform vec3 uHorizonColor;
uniform vec3 uWaveColor;
uniform vec3 uCrestColor;
out vec4 fragColor;

float maskBelow(float y, float line) {
  return smoothstep(line + 0.018, line - 0.018, y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  float time = iTime * uSpeed;
  float scale = max(uWaveScale, 0.1);
  float backLine = 0.56 + sin(uv.x * 5.0 * scale + time) * 0.035 * uAmplitude;
  float middleLine = 0.39 + sin(uv.x * 8.0 * scale - time * 1.3) * 0.05 * uAmplitude;
  float frontLine = 0.18 + sin(uv.x * 11.0 * scale + time * 1.7) * 0.065 * uAmplitude;

  float backWater = maskBelow(uv.y, backLine);
  float middleWater = maskBelow(uv.y, middleLine);
  float frontWater = maskBelow(uv.y, frontLine);
  float crest = (1.0 - smoothstep(0.0, 0.022, abs(uv.y - backLine))) * 0.22;
  crest += (1.0 - smoothstep(0.0, 0.025, abs(uv.y - middleLine))) * 0.36;
  crest += (1.0 - smoothstep(0.0, 0.03, abs(uv.y - frontLine))) * 0.5;

  vec3 color = uHorizonColor;
  color = mix(color, uWaveColor, backWater * 0.32);
  color = mix(color, uWaveColor, middleWater * 0.4);
  color = mix(color, uWaveColor * 0.86, frontWater * 0.36);
  color = mix(color, uCrestColor, clamp(crest, 0.0, 0.45));
  fragColor = vec4(color * uOpacity, uOpacity);
}
`

function toRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? new Float32Array([parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255])
    : new Float32Array([1, 1, 1])
}

function GradientWaves({
  horizonColor = '#b9cad9',
  waveColor = '#194d77',
  crestColor = '#eef5f8',
  speed = 0.18,
  amplitude = 1.7,
  waveScale = 0.72,
  height = 3.4,
  fogDepth = 12,
  opacity = 0.7,
  className = '',
  paused = false,
}) {
  const containerRef = useRef(null)
  const pauseRef = useRef(paused)

  useEffect(() => { pauseRef.current = paused }, [paused])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !window.WebGL2RenderingContext) return undefined

    let frame = 0
    let canvas
    let renderer

    try {
      renderer = new Renderer({ webgl: 2, alpha: true, premultipliedAlpha: true, dpr: Math.min(window.devicePixelRatio || 1, 2) })
      const gl = renderer.gl
      canvas = gl.canvas
      canvas.className = 'gradient-waves-container__canvas'
      container.appendChild(canvas)

      const program = new Program(gl, {
        vertex,
        fragment,
        uniforms: {
          iResolution: { value: new Float32Array([1, 1]) },
          iTime: { value: 0 },
          uSpeed: { value: speed },
          uAmplitude: { value: amplitude },
          uWaveScale: { value: waveScale },
          uHeight: { value: height },
          uFogDepth: { value: fogDepth },
          uOpacity: { value: opacity },
          uHorizonColor: { value: toRgb(horizonColor) },
          uWaveColor: { value: toRgb(waveColor) },
          uCrestColor: { value: toRgb(crestColor) },
        },
      })
      const mesh = new Mesh(gl, { geometry: new Triangle(gl), program })
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

      const render = (time = 0) => {
        if (pauseRef.current) return
        program.uniforms.iTime.value = reducedMotion ? 0 : time * 0.001
        renderer.render({ scene: mesh })
        if (!reducedMotion) frame = window.requestAnimationFrame(render)
      }

      const resize = () => {
        const bounds = container.getBoundingClientRect()
        renderer.setSize(Math.max(1, Math.floor(bounds.width)), Math.max(1, Math.floor(bounds.height)))
        program.uniforms.iResolution.value[0] = gl.drawingBufferWidth
        program.uniforms.iResolution.value[1] = gl.drawingBufferHeight
        renderer.render({ scene: mesh })
      }

      const observer = window.ResizeObserver ? new ResizeObserver(resize) : null
      observer?.observe(container)
      window.addEventListener('resize', resize)
      resize()
      render()

      return () => {
        window.cancelAnimationFrame(frame)
        observer?.disconnect()
        window.removeEventListener('resize', resize)
        canvas?.remove()
        gl.getExtension('WEBGL_lose_context')?.loseContext()
      }
    } catch {
      canvas?.remove()
      return undefined
    }
  }, [amplitude, crestColor, fogDepth, height, horizonColor, opacity, speed, waveColor, waveScale])

  return <div ref={containerRef} className={`gradient-waves-container ${className}`.trim()} data-testid="splash-waves" aria-hidden="true" />
}

export default GradientWaves
