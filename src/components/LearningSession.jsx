import { useEffect, useRef, useState } from 'react'
import { useLearningStore } from '../data/learning'
import { EXTRA_LEARNING_BATCH_SIZE, wordId } from '../data/learning/model'
import { loadWordBook } from '../data/loadWordBook'
import { loadAudioManifest } from '../data/audioManifest'
import { wordBooks } from '../data/wordBooks'
import { describePartOfSpeech } from '../data/partOfSpeech'
import supplementalExamples from '../data/supplementalExamples.json'
import SpeechButton from './SpeechButton'
import StudyTransition from './StudyTransition'
import { learningChoices } from './learningChoices'
import './LearningSession.css'

function messageFor(error, loading) {
  if (/choice content/.test(error.message)) return '暂时无法准备四个有效选项，请重新加载词书后重试。进度保持不变。'
  if (/date changed|today's task/.test(error.message)) return '日期已变化。昨日进度已保留，请开始今天的任务。'
  if (/elsewhere|turn changed/.test(error.message)) return '学习记录已在其他页面更新，请重新读取进度后继续。'
  if (/lock unavailable/.test(error.message)) return '当前浏览器无法安全保存，请在支持 Web Locks 的浏览器本机地址或 HTTPS 页面重试。'
  if (/settings changed/.test(error.message)) return '学习设置已变化，请重新进入今日学习。'
  return loading ? '词书加载失败，请检查网络后重试。已有学习记录保持不变。' : '保存失败，请检查浏览器存储空间或权限后重试。此次操作未计入。'
}

function turnToken(task) {
  return { date: task.date, itemId: task.currentItemId, revision: task.sessionRevision,
    ...(task.kind === 'extra-learning' ? { kind: task.kind, taskId: task.taskId } : {}) }
}

export default function LearningSession({ onExit, loadBook = loadWordBook, initialMode = 'learning' }) {
  const { store, snapshot } = useLearningStore()
  const [loaded, setLoaded] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [audio, setAudio] = useState(null)
  const [audioError, setAudioError] = useState(false)
  const [clock, setClock] = useState(store.getToday)
  const [mode, setMode] = useState(initialMode)
  const pending = useRef(false)
  const heading = useRef(null)
  const alert = useRef(null)
  const extra = loaded ? snapshot.extraLearning[loaded.date] : null
  const task = loaded ? mode === 'extra' ? extra?.batches.at(-1) : snapshot.days[loaded.date]?.learning : null
  const expired = (loaded && loaded.date !== clock) || error.startsWith('日期已变化')

  useEffect(() => { if (error || expired) alert.current?.focus() }, [error, expired])

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
        const daily = store.getTask('learning')
        const process = mode === 'extra' ? store.getExtraLearningProcess() : null
        const current = mode === 'extra' ? store.getExtraLearning() : daily
        const existing = mode === 'extra' && current?.currentItemId === null && !process?.exhausted ? null : current
        const initial = store.getSnapshot()
        const book = wordBooks.find(b => b.id === (existing?.wordBookId ?? (mode === 'extra' ? daily?.wordBookId : initial.settings.todayWordBookId)))
        if (!book) throw Error('book unavailable')
        const session = await loadBook(book)
        const ids = process?.exhausted ? [] : existing ? existing.itemIds.map(id => existing.items[id].wordId)
          : [...new Set((await session.loadLearningOrder()).map(wordId))]
            .filter(id => !store.getWord(book.id, id)?.learning.completed).slice(0, mode === 'extra' ? EXTRA_LEARNING_BATCH_SIZE : initial.settings.dailyNewWords)
        const details = await session.loadWords(ids)
        const words = new Map(details.map(item => [wordId(item.word), item]))
        if (ids.some(id => !words.has(id))) throw Error('Word book details are missing')
        if (cancelled) return
        loading = false
        if (store.getToday() !== date) throw Error('Learning date changed')
        if (mode !== 'extra' && !existing && store.getSnapshot() !== initial) throw Error('Learning settings changed')
        const savedTask = mode === 'extra'
          ? existing ?? await store.ensureExtraLearning(ids, date)
          : existing ?? await store.ensureTodayLearning(book.id, ids, date, initial.settings, { id: 'guided-recall', rulesVersion: 1 })
        if (cancelled) return
        setLoaded({ date: savedTask?.date ?? date, taskId: savedTask?.taskId, book, session, words })
        setClock(store.getToday())
      } catch (failure) {
        if (!cancelled) setError(messageFor(failure, loading))
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    start()
    return () => { cancelled = true }
  }, [store, loadBook, attempt, mode])

  useEffect(() => {
    if (mode === 'extra' && loaded && task && task.taskId === loaded.taskId && task.currentItemId === null
      && !extra.exhausted && !busy && !error && !expired) {
      setLoaded(null)
      setAttempt(value => value + 1)
    }
  }, [mode, loaded, task, extra, busy, error, expired])

  useEffect(() => {
    let cancelled = false
    loadAudioManifest().then(value => { if (!cancelled) setAudio(value) }).catch(() => { if (!cancelled) setAudioError(true) })
    return () => { cancelled = true }
  }, [attempt])

  useEffect(() => {
    if (!loaded || !task || task.method.id !== 'guided-recall' || task.view !== 'question' || task.choice || !task.currentItemId) return
    if (task.kind === 'extra-learning' && task.taskId !== loaded.taskId) return
    const progress = task.items[task.currentItemId]
    if (progress.knownCount !== 0) return
    let cancelled = false
    async function prepare() {
      let loading = true
      setBusy(true)
      try {
        const pool = await loaded.session.loadWords((await loaded.session.loadLearningOrder()).slice(0, 80))
        if (cancelled) return
        const options = learningChoices(loaded.words.get(progress.wordId), pool)
        loading = false
        await store.prepareLearningChoice(turnToken(task), options)
      } catch (failure) { if (!cancelled) setError(messageFor(failure, loading)) }
      finally { setBusy(false) }
    }
    prepare()
    return () => { cancelled = true }
  }, [loaded, task, store])

  const act = async (feedback, action = 'self') => {
    if (pending.current || !task) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const token = turnToken(task)
      if (store.getToday() !== task.date) throw Error('Learning date changed')
      if (action === 'choice') await store.submitLearningChoice(token, feedback)
      else if (action === 'reveal') await store.revealLearningDetails(token)
      else if (feedback) await store.submitSelfAssessment(token, feedback)
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
      if (expired) setMode('learning')
      setLoaded(null)
      setError('')
      setAttempt(value => value + 1)
    } catch { setError('学习记录暂时无法读取，原始数据已保留。请检查浏览器存储权限后重新读取。') }
  }
  const progress = task?.items[task.currentItemId]
  const item = progress && loaded.words.get(progress.wordId)
  const complete = mode === 'extra' ? extra?.exhausted : task && task.currentItemId === null
  const guided = task?.method.id === 'guided-recall'
  const choiceFeedback = guided && task.view === 'feedback' && task.choice && !task.choice.revealed
  const choosing = guided && task.view === 'question' && progress?.knownCount === 0
  const example = item && (item.example?.trim() || supplementalExamples[item.word.toLowerCase()]?.example)
  const wordAudio = item && audio?.words?.[item.word.toLowerCase()]
  const notice = (error || expired) && <div ref={alert} tabIndex={-1} role="alert"><p>{expired ? '日期已变化。昨日进度已保留，请开始今天的任务。' : error}</p>
    <button type="button" disabled={busy} onClick={restart}>{expired ? '开始今天的任务' : loaded || /记录/.test(error) && !/词书/.test(error) ? '重新读取进度' : '重试'}</button>
  </div>
  return <section className="learning-session" aria-label={mode === 'extra' ? '额外学习练习' : '今日学习练习'} aria-busy={busy}>
    <header className="learning-session__header">
      <button type="button" onClick={onExit} disabled={pending.current}>返回主界面</button>
      <p>{loaded ? `${loaded.book.label}${mode === 'extra' ? ' · 额外学习' : ''}` : '准备今日学习'}{task && <span>{mode === 'extra' ? '本组' : ''}已完成 {Object.values(task.items).filter(entry => entry.completed).length} / {task.itemIds.length} 词</span>}</p>
    </header>
    {(!item || expired) && notice}
    {busy && !loaded && <p role="status">正在加载词书与学习进度…</p>}
    {!expired && complete && <div className="learning-session__empty"><h2 ref={heading} tabIndex={-1}>{mode === 'extra' || !task.itemIds.length ? '这本词书已全部学完' : '今日学习已完成'}</h2><p>进度已保存。当天任务保持不变，新的设置从下次创建任务时生效。</p></div>}
    {!expired && item && <StudyTransition transitionKey={`${task.currentItemId}:${task.view}:${!!task.choice?.revealed}`}>
      <article className="learning-session__word">
        <div className="learning-session__word-heading">
          <h2 ref={heading} tabIndex={-1} lang="en">{item.word}</h2>
          <p className="learning-session__count" aria-label={`今日认识 ${progress.knownCount} / 3 次`}>{[1,2,3].map(n => <span key={n} className={progress.knownCount >= n ? 'is-filled' : ''} />)}<span className="learning-session__count-text">{progress.knownCount} / 3</span></p>
        </div>
        <div className="learning-session__body" tabIndex={0} aria-label="单词内容">
          {notice}
          {(choosing || choiceFeedback) ? <>
            <p className="learning-session__phonetic">{item.phonetic}</p>
            <div className="learning-session__pronunciation"><SpeechButton word={item.word} lang={task.settings.pronunciation} src={wordAudio?.[task.settings.pronunciation]} label="发音" /></div>
            <p className="learning-session__hint">先回想词义，再选择；不确定可以看答案。</p>
            {task.choice ? <div className="learning-session__choices">{task.choice.options.map(option => {
              const correct = choiceFeedback && option.word === progress.wordId
              const wrong = choiceFeedback && option.word === task.choice.selectedWord && !correct
              return <button key={option.word} type="button" className={`${correct ? 'is-correct' : ''} ${wrong ? 'is-wrong' : ''}`} disabled={busy || choiceFeedback} onClick={() => act(option.word, 'choice')}>
                <span>{option.meaning}</span>{(correct || wrong) && <small>{correct ? '正确答案' : '你的选择'} · {option.word}</small>}
              </button>
            })}</div> : !error && <p role="status">正在准备选项…</p>}
          </> : task.view === 'question' ? <>
            {guided && progress.knownCount === 1 && <p className="learning-session__example" lang="en">{example || '该词暂无英文例句，请直接回想词义。'}</p>}
            {!guided && <p className="learning-session__hint">先回想词义，再选择你的熟悉程度。</p>}
          </> : <>
            <p className="learning-session__saved" role="status">{task.choice ? (task.choice.selectedWord === progress.wordId ? '首次选对，认识次数加 1' : '已查看答案，本次不增加认识次数') : `已保存：${({ known: '认识', fuzzy: '模糊', unknown: '不认识' })[progress.lastFeedback]}`}{progress.completed ? ' · 本词已完成' : ''}</p>
            <LearningDetails item={item} audio={wordAudio} pronunciation={task.settings.pronunciation} />
            {audioError && <p>发音资源暂时无法加载，可退出后重试；可用时使用浏览器发音。</p>}
            {snapshot.mistakes[progress.wordId]?.entered && !snapshot.mistakes[progress.wordId].removed && <p>已记录到错误证据库。</p>}
          </>}
        </div>
        <footer className="learning-session__footer">
          {choosing ? <button type="button" disabled={busy || !task.choice} onClick={() => act(null, 'choice')}>看答案</button>
            : choiceFeedback ? <button className="learning-session__next" type="button" disabled={busy} onClick={() => act(null, 'reveal')}>继续</button>
            : task.view === 'question' ? <div className="learning-session__actions">{[['known', '认识'], ['fuzzy', '模糊'], ['unknown', '不认识']].map(([value, label]) =>
              <button type="button" key={value} onClick={() => act(value)} disabled={busy}>{label}</button>)}</div>
            : <button className="learning-session__next" type="button" onClick={() => act()} disabled={busy}>下一词</button>}
        </footer>
      </article>
    </StudyTransition>}
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
    <div className="learning-session__detail-grid"><section><h3>释义</h3><p>{item.meaning || '暂无释义'}</p></section><section>
    <h3>{supplement ? '补充例句' : '例句'}</h3><p lang="en">{example || '暂无例句'}</p>
    {translation && <p>{translation}</p>}
    {supplement && item.word === 'reservior' && <p>例句采用规范拼写 reservoir。</p>}
    {example && <SpeechButton word={example} src={audio?.example} label="朗读例句" />}
    </section><section className="learning-session__phrases"><h3>词组</h3>{item.phrases?.length ? <ul>{item.phrases.map((phrase, index) => <li key={index}>{phrase}</li>)}</ul> : <p>暂无词组</p>}</section></div>
  </div>
}
