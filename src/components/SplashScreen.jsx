import { useRef, useState } from 'react'
import '@fontsource-variable/manrope/wght.css'
import GradientWaves from './GradientWaves'
import TextType from './TextType'
import './SplashScreen.css'

const welcomeSentences = [
  '欢迎来到LinguaJet！很高兴见到你！',
  '让我们来进行一些不一样的语言学习体验吧！',
]

function snapshotText(element, textSelector) {
  if (!element) return null

  const styles = window.getComputedStyle(element)
  if (parseFloat(styles.opacity) === 0) return null

  const textElement = textSelector ? element.querySelector(textSelector) : element
  const text = textElement?.textContent?.trim()
  if (!text) return null

  return {
    text,
    rect: element.getBoundingClientRect(),
    color: styles.color,
    fontFamily: styles.fontFamily,
    fontWeight: styles.fontWeight,
    fontSize: parseFloat(styles.fontSize),
    lineHeight: parseFloat(styles.lineHeight) || parseFloat(styles.fontSize) * 1.2,
    textAlign: styles.textAlign,
  }
}

function SplashScreen({ onStartTransition, isParticleSourceReleased, isBackgroundLeaving }) {
  const [isLeaving, setIsLeaving] = useState(false)
  const [isPromptVisible, setIsPromptVisible] = useState(false)
  const [isBrandVisible, setIsBrandVisible] = useState(false)
  const [activeSentence, setActiveSentence] = useState(0)
  const brandRef = useRef(null)
  const messageRef = useRef(null)
  const promptRef = useRef(null)

  const startApp = () => {
    if (isLeaving) return

    const sourceTexts = [
      snapshotText(brandRef.current),
      snapshotText(messageRef.current, '.text-type__content'),
      snapshotText(promptRef.current),
    ].filter(Boolean)

    setIsLeaving(true)
    onStartTransition?.(sourceTexts)
  }

  const finishWelcome = () => {
    setIsBrandVisible(true)
    setIsPromptVisible(true)
  }

  return (
    <main
      className={[
        'splash-screen',
        isLeaving && 'is-particle-active',
        isParticleSourceReleased && 'is-particle-source-released',
        isBackgroundLeaving && 'is-background-leaving',
      ].filter(Boolean).join(' ')}
      aria-label="LinguaJet 欢迎页"
    >
      <GradientWaves className="splash-screen__waves" />
      <div className="splash-screen__content">
        <p
          className={isBrandVisible ? 'splash-screen__brand is-visible' : 'splash-screen__brand'}
          ref={brandRef}
          aria-hidden={!isBrandVisible}
        >
          捷语 · LinguaJet
        </p>
        <TextType
          as="h1"
          className={activeSentence === 0 ? 'splash-screen__message' : 'splash-screen__message is-second-message'}
          text={welcomeSentences}
          typingSpeed={30}
          initialDelay={180}
          pauseDuration={1000}
          deletingSpeed={20}
          showCursor
          elementRef={messageRef}
          onTextChange={setActiveSentence}
          onComplete={finishWelcome}
        />
        <p
          className={isPromptVisible ? 'splash-screen__continue is-visible' : 'splash-screen__continue'}
          ref={promptRef}
          aria-hidden={!isPromptVisible}
        >
          点击任意处继续
        </p>
      </div>
      <button
        className="splash-screen__action"
        type="button"
        onClick={startApp}
        aria-label="进入 LinguaJet"
      />
    </main>
  )
}

export default SplashScreen
