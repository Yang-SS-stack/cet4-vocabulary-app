import { useState } from 'react'
import './App.css'
import LineSidebar from './components/LineSidebar'

const pages = ['今日学习', '词表', '模拟练习', '统计', '设置']

function App() {
  const [selectedPage, setSelectedPage] = useState('今日学习')
  const [isNavOpen, setIsNavOpen] = useState(true)

  return (
    <div className={isNavOpen ? 'app-shell' : 'app-shell is-nav-collapsed'}>
      <aside className="sidebar">
        <div className="brand-mark" aria-label="四级单词学习">
          <span className="brand-kicker">CET-4</span>
          <span className="brand-name">单词簿</span>
        </div>

        <LineSidebar
          className="app-sidebar-nav"
          items={pages}
          accentColor="#96762e"
          textColor="#526176"
          markerColor="#b6a982"
          showIndex={false}
          maxShift={16}
          markerLength={26}
          markerGap={8}
          itemGap={18}
          fontSize={1}
          ariaHidden={!isNavOpen}
          onItemClick={(_, label) => setSelectedPage(label)}
        />

        <p className="sidebar-note">今天也向前一步</p>
      </aside>

      <button
        className="nav-toggle"
        type="button"
        onClick={() => setIsNavOpen((isOpen) => !isOpen)}
        aria-label={isNavOpen ? '隐藏导航栏' : '显示导航栏'}
        aria-expanded={isNavOpen}
        title={isNavOpen ? '隐藏导航栏' : '显示导航栏'}
      >
        <span aria-hidden="true">{isNavOpen ? '‹' : '›'}</span>
      </button>

      <main className="content-area">
        <header className="content-header">
          <span className="eyebrow">四级词汇学习</span>
          <span className="header-date">本地学习空间</span>
        </header>

        <section
          className="page-intro page-transition"
          key={selectedPage}
          aria-labelledby="page-title"
        >
          <p className="section-index">01 / 05</p>
          <h1 id="page-title">{selectedPage}</h1>
          {selectedPage === '今日学习' ? (
            <p className="page-lede">从今天的单词开始</p>
          ) : (
            <p className="page-lede">这一部分即将准备好</p>
          )}
        </section>

        <div className="content-rule" />

        <section className="empty-panel" aria-label={`${selectedPage}内容`}>
          <span className="panel-number">A</span>
          <div>
            <p className="panel-label">当前页面</p>
            <p className="panel-copy">{selectedPage}</p>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
