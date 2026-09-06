import { useCallback, useState } from 'react'
import './App.css'
import FadeContent from './components/FadeContent'
import LineSidebar from './components/LineSidebar'
import ParticleTextTransition from './components/ParticleTextTransition'
import SplashScreen from './components/SplashScreen'
import VocabularyPage from './components/VocabularyPage'

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
              <p className="page-lede">先从一小批单词开始</p>
            ) : (
              <p className="page-lede">这一部分即将准备好</p>
            )}
          </section>

          <div className="content-rule" />

          {selectedPage === '词表' ? (
            <VocabularyPage />
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

function App() {
  const [selectedPage, setSelectedPage] = useState('今日学习')
  const [isNavOpen, setIsNavOpen] = useState(true)
  const [showSplash, setShowSplash] = useState(true)
  const [isBrandRevealed, setIsBrandRevealed] = useState(false)
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
    setIsBrandRevealed(true)
    setParticleSources(null)
    setShowSplash(false)
  }, [])

  const releaseParticleSource = useCallback(() => setIsParticleSourceReleased(true), [])
  const revealBrand = useCallback(() => setIsBrandRevealed(true), [])
  const revealLearningSurface = useCallback(() => {
    setIsLearningRevealed(true)
  }, [])

  return (
    <>
      <LearningSurface
          selectedPage={selectedPage}
          isNavOpen={isNavOpen}
          onNavToggle={() => setIsNavOpen((isOpen) => !isOpen)}
          onPageChange={setSelectedPage}
          logoRef={setParticleLogoElement}
          isBrandConcealed={showSplash && !isBrandRevealed}
          isTransitionPrepared={!isLearningRevealed}
      />
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
          onLogoReveal={revealBrand}
          onComplete={finishParticleTransition}
        />
      )}
    </>
  )
}

export default App
