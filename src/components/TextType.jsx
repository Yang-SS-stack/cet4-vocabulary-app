import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import './TextType.css'

function TextType({
  text,
  as: Component = 'span',
  typingSpeed = 50,
  initialDelay = 0,
  pauseDuration = 1000,
  deletingSpeed = 30,
  loop = false,
  className = '',
  showCursor = true,
  cursorCharacter = '|',
  onSentenceComplete,
  onComplete,
  onTextChange,
  elementRef,
  'aria-label': ariaLabel,
  ...props
}) {
  const textKey = Array.isArray(text) ? text.join('\u0000') : text
  const textArray = useMemo(() => (Array.isArray(text) ? text : [text]), [text])
  const [displayedText, setDisplayedText] = useState('')
  const [currentTextIndex, setCurrentTextIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const cursorRef = useRef(null)
  const completedSentenceIndexesRef = useRef(new Set())
  const hasCompletedSequenceRef = useRef(false)

  useEffect(() => {
    setDisplayedText('')
    setCurrentTextIndex(0)
    setIsDeleting(false)
    completedSentenceIndexesRef.current = new Set()
    hasCompletedSequenceRef.current = false
  }, [textKey])

  useEffect(() => {
    onTextChange?.(currentTextIndex)
  }, [currentTextIndex, onTextChange])

  useEffect(() => {
    const currentText = textArray[currentTextIndex] ?? ''
    const currentCharacters = [...currentText]
    const displayedCharacters = [...displayedText]
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    if (reducedMotion) {
      const finalIndex = textArray.length - 1
      const finalText = textArray[finalIndex] ?? ''
      setDisplayedText(finalText)
      setCurrentTextIndex(finalIndex)
      setIsDeleting(false)
      if (!hasCompletedSequenceRef.current) {
        hasCompletedSequenceRef.current = true
        onSentenceComplete?.(finalText, finalIndex)
        onComplete?.(finalText, finalIndex)
      }
      return undefined
    }

    if (isDeleting) {
      if (displayedCharacters.length > 0) {
        const timer = window.setTimeout(() => {
          setDisplayedText(displayedCharacters.slice(0, -1).join(''))
        }, deletingSpeed)
        return () => window.clearTimeout(timer)
      }

      setIsDeleting(false)
      setCurrentTextIndex((index) => (index + 1) % textArray.length)
      return undefined
    }

    if (displayedCharacters.length < currentCharacters.length) {
      const delay = displayedCharacters.length === 0 && currentTextIndex === 0
        ? initialDelay
        : typingSpeed
      const timer = window.setTimeout(() => {
        setDisplayedText(currentCharacters.slice(0, displayedCharacters.length + 1).join(''))
      }, delay)
      return () => window.clearTimeout(timer)
    }

    if (!completedSentenceIndexesRef.current.has(currentTextIndex)) {
      completedSentenceIndexesRef.current.add(currentTextIndex)
      onSentenceComplete?.(currentText, currentTextIndex)
    }

    const isLastText = currentTextIndex === textArray.length - 1
    if (isLastText && !loop) {
      if (!hasCompletedSequenceRef.current) {
        hasCompletedSequenceRef.current = true
        onComplete?.(currentText, currentTextIndex)
      }
      return undefined
    }

    const timer = window.setTimeout(() => setIsDeleting(true), pauseDuration)
    return () => window.clearTimeout(timer)
  }, [
    currentTextIndex,
    deletingSpeed,
    displayedText,
    initialDelay,
    isDeleting,
    loop,
    onComplete,
    onSentenceComplete,
    pauseDuration,
    textArray,
    textKey,
    typingSpeed,
  ])

  useEffect(() => {
    if (!showCursor || !cursorRef.current) return undefined

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      gsap.set(cursorRef.current, { opacity: 1 })
      return undefined
    }

    const context = gsap.context(() => {
      gsap.to(cursorRef.current, {
        opacity: 0.18,
        duration: 0.5,
        ease: 'power2.inOut',
        repeat: -1,
        yoyo: true,
      })
    })

    return () => context.revert()
  }, [showCursor])

  return createElement(
    Component,
    {
      className: `text-type ${className}`.trim(),
      ref: elementRef,
      'aria-label': ariaLabel ?? textArray[currentTextIndex],
      ...props,
    },
    <span className="text-type__content" aria-hidden="true">
      {displayedText}
    </span>,
    showCursor && (
      <span ref={cursorRef} className="text-type__cursor" aria-hidden="true">
        {cursorCharacter}
      </span>
    ),
  )
}

export default TextType
