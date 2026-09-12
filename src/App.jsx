import { useCallback, useState } from 'react'
import './App.css'
import FadeContent from './components/FadeContent'
import LineSidebar from './components/LineSidebar'
import ParticleTextTransition from './components/ParticleTextTransition'
import SplashScreen from './components/SplashScreen'
import SettingsPage from './components/SettingsPage'
import TodayLearningPage from './components/TodayLearningPage'
import VocabularyPage from './components/VocabularyPage'
import { createLearningStore, LEARNING_STORAGE_KEY, LearningStoreProvider } from './data/learning'

const pages = ['今日学习', '词表', '模拟练习', '统计', '设置']

function LearningSurface({ selectedPage, isNavOpen, onNavToggle, onPageChange, logoRef, isBrandConcealed, isTransitionPrepared }) {
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
          accentColor="#96762e"
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
            <h1 id="page-title">{selectedPage}</h1>
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
  const [showSplash, setShowSplash] = useState(true)
  const [particleSources, setParticleSources] = useState(null)
  const [particleLogoElement, setParticleLogoElement] = useState(null)
  const [isParticleSourceReleased, setIsParticleSourceReleased] = useState(false)
  const [isLearningRevealed, setIsLearningRevealed] = useState(false)

  const startParticleTransition = useCallback((sourceTexts) => {
    setParticleSources(sourceTexts)
    setIsParticleSourceReleased(false)
    setIsLearningRevealed(false)
  }, [])

  const finishParticleTransition = useCallback(() => {
    setIsLearningRevealed(true)
    setParticleSources(null)
    setShowSplash(false)
  }, [])

  const releaseParticleSource = useCallback(() => setIsParticleSourceReleased(true), [])
  const revealLearningSurface = useCallback(() => {
    setIsLearningRevealed(true)
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
          isBrandConcealed={showSplash}
          isTransitionPrepared={!isLearningRevealed}
        />
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

function LearningDataRecovery({ onReset }) {
  const [showVocabulary, setShowVocabulary] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [resetError, setResetError] = useState('')

  const reset = () => {
    setResetError('')
    try {
      onReset()
    } catch {
      setResetError('清除失败，请检查浏览器是否允许本地存储后再试。')
    }
  }

  return (
    <main className="learning-data-recovery">
      <section className="learning-data-recovery__notice" role="alert" aria-labelledby="learning-data-recovery-title">
        <p className="learning-data-recovery__eyebrow">本地学习记录</p>
        <h1 id="learning-data-recovery-title">学习数据暂时无法读取</h1>
        <p>保存的数据可能已损坏，或来自当前版本尚不支持的格式。原始数据仍保留在此浏览器中。</p>
        <div className="learning-data-recovery__actions">
          <button type="button" onClick={() => setShowVocabulary(true)}>继续浏览词表</button>
          <button type="button" className="learning-data-recovery__danger" onClick={() => setConfirmingReset(true)}>清除异常学习数据</button>
        </div>

        {confirmingReset && (
          <section
            className="learning-data-recovery__confirmation"
            role="alertdialog"
            aria-labelledby="learning-data-reset-title"
            aria-describedby="learning-data-reset-description"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setConfirmingReset(false)
            }}
          >
            <h2 id="learning-data-reset-title">确认清除学习数据</h2>
            <p id="learning-data-reset-description">这会永久删除异常的学习设置和进度。词表资源不会受影响。</p>
            <div className="learning-data-recovery__actions">
              <button type="button" autoFocus onClick={() => setConfirmingReset(false)}>保留原始数据</button>
              <button type="button" className="learning-data-recovery__danger" onClick={reset}>确认清除并重新开始</button>
            </div>
          </section>
        )}

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
    </main>
  )
}

function initializeLearningStore() {
  try {
    return { store: createLearningStore(), error: null }
  } catch (error) {
    return { store: null, error }
  }
}

function App() {
  const [learningState, setLearningState] = useState(initializeLearningStore)

  const resetLearningData = () => {
    globalThis.localStorage.removeItem(LEARNING_STORAGE_KEY)
    const nextState = initializeLearningStore()
    setLearningState(nextState)
    if (nextState.error) throw nextState.error
  }

  return learningState.store
    ? <LearningApp learningStore={learningState.store} />
    : <LearningDataRecovery onReset={resetLearningData} />
}

export default App
