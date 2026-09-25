import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import FadeContent from './components/FadeContent'
import LineSidebar from './components/LineSidebar'
import LearningSetupModal from './components/LearningSetupModal'
import ParticleTextTransition from './components/ParticleTextTransition'
import SplashScreen from './components/SplashScreen'
import SettingsPage from './components/SettingsPage'
import TodayLearningPage from './components/TodayLearningPage'
import VocabularyPage from './components/VocabularyPage'
import { initialSetupComplete } from './components/setupDraft'
import { LEARNING_STORAGE_KEY, LearningStoreProvider, useLearningStore } from './data/learning'
import { createBrowserLearningStore } from './data/learning/browserStore'

const pages = ['今日学习', '词表', '模拟练习', '统计', '设置']
const RECOVERY_CLOSE_DURATION = 180

function LearningSurface({ selectedPage, isNavOpen, onNavToggle, onPageChange, logoRef, pageTitleRef, isBrandConcealed, isTransitionPrepared }) {
  return (
    <div className={[
      'app-shell',
      !isNavOpen && 'is-nav-collapsed',
      isTransitionPrepared && 'is-transition-prepared',
    ].filter(Boolean).join(' ')} aria-hidden={isTransitionPrepared} inert={isTransitionPrepared}>
      <aside
        className="sidebar"
        aria-hidden={!isNavOpen}
        inert={!isNavOpen}
      >
        <div className="brand-mark" aria-label="LinguaJet">
          <span ref={logoRef} className={isBrandConcealed ? 'brand-name is-brand-concealed' : 'brand-name'}>LinguaJet</span>
        </div>

        <LineSidebar
          className="app-sidebar-nav"
          items={pages}
          accentColor="#76591e"
          textColor="#526176"
          markerColor="#b6a982"
          showIndex={false}
          markerLength={26}
          markerGap={8}
          itemGap={18}
          fontSize={1}
          onItemClick={(_, label) => onPageChange(label)}
        />

        <p className="sidebar-note">今天也向前一步</p>
      </aside>

      <button
        className={isNavOpen ? 'nav-toggle is-open' : 'nav-toggle'}
        type="button"
        onClick={onNavToggle}
        aria-label={isNavOpen ? '隐藏导航栏' : '显示导航栏'}
        aria-expanded={isNavOpen}
        title={isNavOpen ? '隐藏导航栏' : '显示导航栏'}
      >
        <span aria-hidden="true" />
      </button>

      <main className="content-area">
        <FadeContent key={selectedPage}>
          <section className="page-intro" aria-labelledby="page-title">
            <h1 ref={pageTitleRef} id="page-title" tabIndex={-1}>{selectedPage}</h1>
            {selectedPage === '今日学习' ? (
              <p className="page-lede">从今天的单词开始</p>
            ) : selectedPage === '词表' ? (
              <p className="page-lede">查找单词，浏览释义与例句</p>
            ) : selectedPage === '设置' ? (
              <p className="page-lede">按你的时间，调整之后的学习计划</p>
            ) : (
              <p className="page-lede">这一部分即将准备好</p>
            )}
          </section>

          <div className="content-rule" />

          {selectedPage === '今日学习' ? (
            <TodayLearningPage />
          ) : selectedPage === '词表' ? (
            <VocabularyPage />
          ) : selectedPage === '设置' ? (
            <SettingsPage />
          ) : (
            <section className="empty-panel" aria-label={`${selectedPage}内容`}>
              <span className="panel-number">A</span>
              <div>
                <p className="panel-label">当前页面</p>
                <p className="panel-copy">{selectedPage}</p>
              </div>
            </section>
          )}
        </FadeContent>
      </main>
    </div>
  )
}

function LearningApp({ learningStore }) {
  const [selectedPage, setSelectedPage] = useState('今日学习')
  const [isNavOpen, setIsNavOpen] = useState(true)
  const [showInitialSetup, setShowInitialSetup] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const [particleSources, setParticleSources] = useState(null)
  const [particleLogoElement, setParticleLogoElement] = useState(null)
  const [isParticleSourceReleased, setIsParticleSourceReleased] = useState(false)
  const [isLearningRevealed, setIsLearningRevealed] = useState(false)
  const pageTitleRef = useRef(null)
  const setupFocusTimerRef = useRef(null)
  const shouldRestoreSetupFocusRef = useRef(false)

  useEffect(() => () => window.clearTimeout(setupFocusTimerRef.current), [])

  useEffect(() => {
    if (showInitialSetup || !shouldRestoreSetupFocusRef.current) return
    shouldRestoreSetupFocusRef.current = false
    window.clearTimeout(setupFocusTimerRef.current)
    setupFocusTimerRef.current = window.setTimeout(() => pageTitleRef.current?.focus(), 0)
  }, [showInitialSetup])

  const startParticleTransition = useCallback((sourceTexts) => {
    setParticleSources(sourceTexts)
    setIsParticleSourceReleased(false)
    setIsLearningRevealed(false)
  }, [])

  const finishParticleTransition = useCallback(() => {
    setIsLearningRevealed(true)
    setParticleSources(null)
    setShowSplash(false)
    setShowInitialSetup(!initialSetupComplete(learningStore.getSnapshot().settings))
  }, [learningStore])

  const releaseParticleSource = useCallback(() => setIsParticleSourceReleased(true), [])
  const revealLearningSurface = useCallback(() => {
    setIsLearningRevealed(true)
  }, [])

  const closeInitialSetup = useCallback(() => {
    shouldRestoreSetupFocusRef.current = true
    setShowInitialSetup(false)
  }, [])

  return (
    <>
      <LearningStoreProvider store={learningStore}>
        <LearningSurface
          selectedPage={selectedPage}
          isNavOpen={isNavOpen}
          onNavToggle={() => setIsNavOpen((isOpen) => !isOpen)}
          onPageChange={setSelectedPage}
          logoRef={setParticleLogoElement}
          pageTitleRef={pageTitleRef}
          isBrandConcealed={showSplash}
          isTransitionPrepared={!isLearningRevealed}
        />
        {showInitialSetup && (
          <InitialLearningSetup onClose={closeInitialSetup} />
        )}
      </LearningStoreProvider>
      {showSplash && (
        <SplashScreen
          onStartTransition={startParticleTransition}
          isParticleSourceReleased={isParticleSourceReleased}
          isBackgroundLeaving={isLearningRevealed}
        />
      )}
      {particleSources && (
        <ParticleTextTransition
          sourceTexts={particleSources}
          targetElement={particleLogoElement}
          onSourceRelease={releaseParticleSource}
          onScatterComplete={revealLearningSurface}
          onComplete={finishParticleTransition}
        />
      )}
    </>
  )
}

function InitialLearningSetup({ onClose }) {
  const { store, snapshot } = useLearningStore()
  return (
    <LearningSetupModal
      mode="initial"
      settings={snapshot.settings}
      snapshot={snapshot}
      onSave={(patch) => store.updateSettings(patch)}
      onClose={onClose}
    />
  )
}

function LearningDataRecovery({ onReset }) {
  const [showVocabulary, setShowVocabulary] = useState(false)
  const [confirmationPhase, setConfirmationPhase] = useState('closed')
  const [resetError, setResetError] = useState('')
  const resetTriggerRef = useRef(null)
  const confirmationRef = useRef(null)
  const closeTimerRef = useRef(null)
  const restoreFocusRef = useRef(false)
  const confirmingReset = confirmationPhase !== 'closed'

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), [])

  useEffect(() => {
    if (confirmationPhase === 'open') {
      focusableElements(confirmationRef.current)[0]?.focus()
    } else if (confirmationPhase === 'closed' && restoreFocusRef.current) {
      restoreFocusRef.current = false
      resetTriggerRef.current?.focus()
    }
  }, [confirmationPhase])

  const finishConfirmationClose = (afterClose) => {
    setConfirmationPhase('closed')
    restoreFocusRef.current = true
    afterClose?.()
  }

  const closeConfirmation = (afterClose) => {
    if (confirmationPhase === 'closing') return
    setConfirmationPhase('closing')
    if (prefersReducedMotion()) {
      finishConfirmationClose(afterClose)
      return
    }
    closeTimerRef.current = window.setTimeout(
      () => finishConfirmationClose(afterClose),
      RECOVERY_CLOSE_DURATION,
    )
  }

  const reset = () => {
    setResetError('')
    closeConfirmation(async () => {
      try {
        const result = await onReset()
        if (result === 'changed') {
          setResetError('数据已在其他页面更新，请重新确认后再决定是否清除。')
        }
      } catch {
        setResetError('清除失败，请检查浏览器是否允许本地存储后再试。')
      }
    })
  }

  const handleConfirmationKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeConfirmation()
      return
    }
    if (event.key !== 'Tab') return

    const controls = focusableElements(confirmationRef.current)
    if (controls.length === 0) return
    const first = controls[0]
    const last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <main className="learning-data-recovery">
      <div
        className="learning-data-recovery__context"
        aria-hidden={confirmingReset || undefined}
        inert={confirmingReset || undefined}
      >
        <section className="learning-data-recovery__notice" role="alert" aria-labelledby="learning-data-recovery-title">
          <p className="learning-data-recovery__eyebrow">本地学习记录</p>
          <h1 id="learning-data-recovery-title">学习数据暂时无法读取</h1>
          <p>保存的数据可能已损坏，或来自当前版本尚不支持的格式。原始数据仍保留在此浏览器中。</p>
          <div className="learning-data-recovery__actions">
            <button type="button" onClick={() => setShowVocabulary(true)}>继续浏览词表</button>
            <button
              ref={resetTriggerRef}
              type="button"
              className="learning-data-recovery__danger"
              onClick={() => setConfirmationPhase('open')}
            >
              清除异常学习数据
            </button>
          </div>

          {resetError && <p className="learning-data-recovery__error" role="status" aria-live="polite">{resetError}</p>}
        </section>

        {showVocabulary && (
          <section className="learning-data-recovery__vocabulary" aria-label="词表浏览">
            <header>
              <p className="learning-data-recovery__eyebrow">不受学习数据影响</p>
              <h2>词表</h2>
            </header>
            <VocabularyPage />
          </section>
        )}
      </div>

      {confirmingReset && (
        <div className={confirmationPhase === 'closing'
          ? 'learning-data-recovery__confirmation-backdrop is-closing'
          : 'learning-data-recovery__confirmation-backdrop'}>
          <section
            ref={confirmationRef}
            className={confirmationPhase === 'closing'
              ? 'learning-data-recovery__confirmation is-closing'
              : 'learning-data-recovery__confirmation'}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="learning-data-reset-title"
            aria-describedby="learning-data-reset-description"
            onKeyDown={handleConfirmationKeyDown}
          >
            <h2 id="learning-data-reset-title">确认清除学习数据</h2>
            <p id="learning-data-reset-description">这会永久删除异常的学习设置和进度。词表资源不会受影响。</p>
            <div className="learning-data-recovery__actions">
              <button type="button" onClick={() => closeConfirmation()}>保留原始数据</button>
              <button type="button" className="learning-data-recovery__danger" onClick={reset}>确认清除并重新开始</button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

function initializeLearningStore() {
  try {
    return { store: createBrowserLearningStore(), error: null, failedRaw: null }
  } catch (error) {
    let failedRaw
    try {
      failedRaw = globalThis.localStorage.getItem(LEARNING_STORAGE_KEY)
    } catch {
      failedRaw = undefined
    }
    return { store: null, error, failedRaw }
  }
}

function App() {
  const [learningState, setLearningState] = useState(initializeLearningStore)

  const resetLearningData = async () => {
    if (!globalThis.navigator?.locks?.request) throw new Error('Safe storage lock unavailable')
    return navigator.locks.request(LEARNING_STORAGE_KEY, { mode: 'exclusive' }, () => {
      const currentRaw = globalThis.localStorage.getItem(LEARNING_STORAGE_KEY)
      if (currentRaw !== learningState.failedRaw) {
        const nextState = initializeLearningStore()
        setLearningState(nextState)
        return nextState.store ? 'reloaded' : 'changed'
      }

      globalThis.localStorage.removeItem(LEARNING_STORAGE_KEY)
      const nextState = initializeLearningStore()
      setLearningState(nextState)
      if (nextState.error) throw nextState.error
      return 'reset'
    })
  }

  return learningState.store
    ? <LearningApp learningStore={learningState.store} />
    : <LearningDataRecovery onReset={resetLearningData} />
}

function focusableElements(root) {
  if (!root) return []
  return [...root.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.closest('[inert]'))
}

function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

export default App
