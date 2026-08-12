import { useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'
import './FadeContent.css'

function FadeContent({ children, className = '' }) {
  const contentRef = useRef(null)

  useLayoutEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const context = gsap.context(() => {
      if (reducedMotion) {
        gsap.set(contentRef.current, { clearProps: 'all' })
        return
      }

      gsap.fromTo(
        contentRef.current,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.36, ease: 'power2.out' },
      )
    }, contentRef)

    return () => context.revert()
  }, [])

  return (
    <div ref={contentRef} className={`fade-content ${className}`.trim()}>
      {children}
    </div>
  )
}

export default FadeContent
