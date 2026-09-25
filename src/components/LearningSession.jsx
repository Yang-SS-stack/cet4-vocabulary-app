import { useEffect, useRef, useState } from 'react'
import { useLearningStore } from '../data/learning'
import { wordId } from '../data/learning/model'
import { loadWordBook } from '../data/loadWordBook'
import { loadAudioManifest } from '../data/audioManifest'
import { wordBooks } from '../data/wordBooks'
import { describePartOfSpeech } from '../data/partOfSpeech'
import supplementalExamples from '../data/supplementalExamples.json'
import SpeechButton from './SpeechButton'
import './LearningSession.css'

function messageFor(error, loading) {
  if (/date changed|today's task/.test(error.message)) return '日期已变化。昨日进度已保留，请开始今天的任务。'
  if (/elsewhere|turn changed/.test(error.message)) return '学习记录已在其他页面更新，请重新读取进度后继续。'
  if (/lock unavailable/.test(error.message)) return '当前浏览器无法安全保存，请在支持 Web Locks 的浏览器本机地址或 HTTPS 页面重试。'
  if (/settings changed/.test(error.message)) return '学习设置已变化，请重新进入今日学习。'
  return loading ? '词书加载失败，请检查网络后重试。已有学习记录保持不变。' : '保存失败，请检查浏览器存储空间或权限后重试。此次操作未计入。'
}

export default function LearningSession({ onExit, loadBook = loadWordBook }) {
  const { store, snapshot } = useLearningStore()
  const [loaded, setLoaded] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [audio, setAudio] = useState(null)
  const [audioError, setAudioError] = useState(false)
  const [clock, setClock] = useState(store.getToday)
  const pending = useRef(false)
  const heading = useRef(null)
  const task = loaded ? snapshot.days[loaded.date]?.learning : null
  const expired = (task && task.date !== clock) || error.startsWith('日期已变化')

  useEffect(() => {
    const update = () => setClock(store.getToday())
    const timer = window.setInterval(update, 1000)
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update) }
  }, [store])

  useEffect(() => {
    let cancelled = false
    async function start() {
      let loading = true
      setBusy(true)
      setError('')
      try {
        const date = store.getToday()
        const existing = store.getTask('learning')
        const initial = store.getSnapshot()
        const book = wordBooks.find(b => b.id === (existing?.wordBookId ?? initial.settings.todayWordBookId))
        if (!book) throw Error('book unavailable')
        const session = await loadBook(book)
        const ids = existing ? existing.itemIds.map(id => existing.items[id].wordId)
          : [...new Set((await session.loadLearningOrder()).map(wordId))]
            .filter(id => !store.getWord(book.id, id)?.learning.completed).slice(0, initial.settings.dailyNewWords)
        const details = await session.loadWords(ids)
        if (cancelled) return
        loading = false
        if (store.getToday() !== date) throw Error('Learning date changed')
        if (!existing && store.getSnapshot() !== initial) throw Error('Learning settings changed')
        const savedTask = existing ?? await store.ensureTodayLearning(book.id, ids, date, initial.settings)
        if (cancelled) return
        setLoaded({ date: savedTask.date, book, words: new Map(details.map(item => [wordId(item.word), item])) })
        setClock(store.getToday())
      } catch (failure) {
        if (!cancelled) setError(messageFor(failure, loading))
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    start()
    return () => { cancelled = true }
  }, [store, loadBook, attempt])

  useEffect(() => {
    let cancelled = false
    loadAudioManifest().then(value => { if (!cancelled) setAudio(value) }).catch(() => { if (!cancelled) setAudioError(true) })
    return () => { cancelled = true }
  }, [attempt])

  useEffect(() => { heading.current?.focus() }, [task?.currentItemId, task?.view, loaded])

  const act = async (feedback) => {
    if (pending.current || !task) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const token = { date: task.date, itemId: task.currentItemId, revision: task.sessionRevision }
      if (store.getToday() !== task.date) throw Error('Learning date changed')
      if (feedback) await store.submitSelfAssessment(token, feedback)
      else await store.advanceLearning(token)
    } catch (failure) {
      setError(messageFor(failure, false))
    } finally {
      pending.current = false
      setBusy(false)
      setClock(store.getToday())
    }
  }
  const restart = () => {
    try {
      store.reload()
      setLoaded(null)
      setError('')
      setAttempt(value => value + 1)
    } catch { setError('学习记录暂时无法读取，原始数据已保留。请检查浏览器存储权限后重新读取。') }
  }
  const progress = task?.items[task.currentItemId]
  const item = progress && loaded.words.get(progress.wordId)
  const complete = task && task.currentItemId === null
  return <section className="learning-session" aria-label="今日自评学习" aria-busy={busy}>
    <header className="learning-session__header">
      <p>{loaded ? `${loaded.book.label} · ${loaded.date} · 自评学习` : '准备今日学习'}</p>
      <button type="button" onClick={onExit} disabled={busy}>退出学习</button>
    </header>
    {task && <p>已完成 {Object.values(task.items).filter(entry => entry.completed).length} / {task.itemIds.length} 词</p>}
    {(error || expired) && <div role="alert"><p>{expired ? '日期已变化。昨日进度已保留，请开始今天的任务。' : error}</p>
      <button type="button" disabled={busy} onClick={restart}>{expired ? '开始今天的任务' : loaded || /记录/.test(error) && !/词书/.test(error) ? '重新读取进度' : '重试'}</button>
    </div>}
    {busy && !loaded && <p role="status">正在加载词书与学习进度…</p>}
    {!expired && complete && <div><h2 ref={heading} tabIndex={-1}>{task.itemIds.length ? '今日学习已完成' : '这本词书已全部学完'}</h2><p>进度已保存。当天任务保持不变，新的设置从下次创建任务时生效。</p></div>}
    {!expired && item && <article className="learning-session__word">
      <h2 ref={heading} tabIndex={-1} lang="en">{item.word}</h2>
      <p>今日认识 {progress.knownCount} / 3 次</p>
      {task.view === 'question' ? <>
        <p>先回想词义，再选择你的熟悉程度。</p>
        <div className="learning-session__actions">{[['known', '认识'], ['fuzzy', '模糊'], ['unknown', '不认识']].map(([value, label]) =>
          <button type="button" key={value} onClick={() => act(value)} disabled={busy}>{label}</button>)}</div>
      </> : <>
        <p role="status">已保存：{({ known: '认识', fuzzy: '模糊', unknown: '不认识' })[progress.lastFeedback]}{progress.completed ? ' · 本词已完成' : ''}</p>
        <LearningDetails item={item} audio={audio?.words?.[item.word.toLowerCase()]} pronunciation={task.settings.pronunciation} />
        {audioError && <p>发音资源暂时无法加载，可退出后重试；可用时使用浏览器发音。</p>}
        {snapshot.mistakes[progress.wordId]?.entered && !snapshot.mistakes[progress.wordId].removed && <p>已记录到错误证据库。</p>}
        <button className="learning-session__next" type="button" onClick={() => act()} disabled={busy}>下一词</button>
      </>}
    </article>}
    {task && <p className="learning-session__rule">当前自评规则：认识加 1，满 3 次完成；模糊减 1（最低 0）；不认识清零。未完成词按任务顺序循环。</p>}
  </section>
}

function LearningDetails({ item, audio, pronunciation }) {
  const supplement = !item.example?.trim() ? supplementalExamples[item.word.toLowerCase()] : null
  const example = supplement?.example ?? item.example
  const translation = supplement?.translation ?? item.translation
  const langs = pronunciation === 'en-US' ? ['en-US', 'en-GB'] : ['en-GB', 'en-US']
  return <div className="learning-session__details">
    <p>{item.phonetic} {describePartOfSpeech(item.partOfSpeech ?? '')}</p>
    <div className="learning-session__actions">{langs.map(lang => <SpeechButton key={lang} word={item.word} lang={lang} src={audio?.[lang]} label={lang === 'en-GB' ? '英音' : '美音'} accessibleLabel={`${item.word} ${lang === 'en-GB' ? '英音' : '美音'}`} />)}</div>
    <h3>释义</h3><p>{item.meaning || '暂无释义'}</p>
    <h3>{supplement ? '补充例句' : '例句'}</h3><p lang="en">{example || '暂无例句'}</p>
    {translation && <p>{translation}</p>}
    {supplement && item.word === 'reservior' && <p>例句采用规范拼写 reservoir。</p>}
    {example && <SpeechButton word={example} src={audio?.example} label="朗读例句" />}
    <h3>词组</h3>{item.phrases?.length ? <ul>{item.phrases.map((phrase, index) => <li key={index}>{phrase}</li>)}</ul> : <p>暂无词组</p>}
  </div>
}
