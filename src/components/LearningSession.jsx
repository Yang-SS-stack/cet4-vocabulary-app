import { useEffect, useRef, useState } from 'react'
import { useLearningStore } from '../data/learning'
import { canCorrectLearningFeedback } from '../data/learning/selfAssessment'
import { canCorrectReviewFeedback, REVIEW_GUIDED_RECALL } from '../data/learning/reviewSession'
import { EXTRA_LEARNING_BATCH_SIZE, wordId } from '../data/learning/model'
import { loadWordBook } from '../data/loadWordBook'
import { loadAudioManifest } from '../data/audioManifest'
import { wordBooks } from '../data/wordBooks'
import { describePartOfSpeech } from '../data/partOfSpeech'
import supplementalExamples from '../data/supplementalExamples.json'
import SpeechButton from './SpeechButton'
import StudyTransition from './StudyTransition'
import LoadingIndicator from './LoadingIndicator'
import { cancelSpeechScope, playSpeechSequence, speechMessage } from './speechPlayback'
import { learningChoices } from './learningChoices'
import './LearningSession.css'

function messageFor(error, loading, review = false) {
  if (/Legacy review/.test(error.message)) return '这份旧版复习任务无法使用当前流程。已有进度保留，请返回主界面。'
  if (/Set review settings/.test(error.message)) return '请先在设置中选择词书和每日复习数量（1–100）。'
  if (/choice content/.test(error.message)) return '暂时无法准备四个有效选项，请重新加载词书后重试。进度保持不变。'
  if (/date changed|today's task/.test(error.message)) return '日期已变化。昨日进度已保留，请开始今天的任务。'
  if (/elsewhere|turn changed/.test(error.message)) return '学习记录已在其他页面更新，请重新读取进度后继续。'
  if (/lock unavailable/.test(error.message)) return '当前浏览器无法安全保存，请在支持 Web Locks 的浏览器本机地址或 HTTPS 页面重试。'
  if (/settings changed/.test(error.message)) return review ? '复习设置已变化，请重新进入今日复习。' : '学习设置已变化，请重新进入今日学习。'
  return loading ? '词书加载失败，请检查网络后重试。已有学习记录保持不变。' : '保存失败，请检查浏览器存储空间或权限后重试。此次操作未计入。'
}

function turnToken(task) {
  return { date: task.date, itemId: task.currentItemId, revision: task.sessionRevision,
    ...(task.kind === 'extra-learning' ? { kind: task.kind, taskId: task.taskId } : {}) }
}

export default function LearningSession({ onExit, loadBook = loadWordBook, initialMode = 'learning', animateEntry = false }) {
  const { store, snapshot } = useLearningStore()
  const [loaded, setLoaded] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [audio, setAudio] = useState(null)
  const [audioError, setAudioError] = useState(false)
  const [clock, setClock] = useState(store.getToday)
  const [mode, setMode] = useState(initialMode)
  const review = mode === 'review'
  const [nextTurn, setNextTurn] = useState(0)
  const [readyWord, setReadyWord] = useState('')
  const [readyBody, setReadyBody] = useState('')
  const [speechState, setSpeechState] = useState({ key: '', state: 'idle' })
  const [correctPhase, setCorrectPhase] = useState('')
  const [confirmExit, setConfirmExit] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [entering, setEntering] = useState(() => animateEntry && Boolean(window.matchMedia) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [initialWordReady, setInitialWordReady] = useState(() => !animateEntry || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const exitCallback = useRef(onExit)
  const exitButton = useRef(null)
  const speechScope = useRef({})
  const speechConfig = useRef(null)
  const pending = useRef(false)
  const exitRequested = useRef(false)
  const heading = useRef(null)
  const body = useRef(null)
  const footer = useRef(null)
  const alert = useRef(null)
  const extra = loaded ? snapshot.extraLearning[loaded.date] : null
  const task = loaded ? mode === 'extra' ? extra?.batches.at(-1) : snapshot.days[loaded.date]?.[review ? 'review' : 'learning'] : null
  const reviewAudioReady = !review || Boolean(loaded && task?.currentItemId)
  const expired = (loaded && loaded.date !== clock) || error.startsWith('日期已变化')

  useEffect(() => { exitCallback.current = onExit }, [onExit])
  useEffect(() => {
    if (!entering) return
    const timer = window.setTimeout(() => setEntering(false), 240)
    return () => window.clearTimeout(timer)
  }, [entering])
  useEffect(() => {
    if (animateEntry && !entering) (alert.current ?? heading.current)?.focus({ preventScroll: true })
  }, [animateEntry, entering])
  useEffect(() => {
    if (!exiting) return
    const reduced = !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => exitCallback.current(), reduced ? 0 : 240)
    return () => window.clearTimeout(timer)
  }, [exiting])

  useEffect(() => { if (error || expired) alert.current?.focus() }, [error, expired])

  useEffect(() => {
    const update = () => setClock(store.getToday())
    const timer = window.setInterval(update, 1000)
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update) }
  }, [store])

  useEffect(() => {
    if (exitRequested.current) return
    let cancelled = false
    async function start() {
      let loading = true
      setBusy(true)
      setError('')
      try {
        const date = store.getToday()
        if (review) {
          loading = false
          const savedTask = await store.ensureTodayReview(date, store.getSnapshot().settings)
          if (cancelled || exitRequested.current) return
          if (savedTask.method?.id !== REVIEW_GUIDED_RECALL.id) throw Error('Legacy review cannot use this review session')
          const book = wordBooks.find(b => b.id === savedTask.wordBookId)
          if (!book) throw Error('book unavailable')
          if (savedTask.currentItemId === null) {
            setLoaded({ date: savedTask.date, book, session: null, words: new Map() })
            setClock(store.getToday())
            return
          }
          loading = true
          const session = await loadBook(book)
          if (cancelled || exitRequested.current) return
          const ids = savedTask.itemIds.map(id => savedTask.items[id].wordId)
          const details = await session.loadWords(ids)
          if (cancelled || exitRequested.current) return
          const words = new Map(details.map(item => [wordId(item.word), item]))
          if (ids.some(id => !words.has(id))) throw Error('Word book details are missing')
          if (store.getToday() !== date) throw Error('Review date changed')
          setLoaded({ date: savedTask.date, book, session, words })
          setClock(store.getToday())
          return
        }
        const daily = store.getTask('learning')
        const process = mode === 'extra' ? store.getExtraLearningProcess() : null
        const current = mode === 'extra' ? store.getExtraLearning() : daily
        const existing = mode === 'extra' && current?.currentItemId === null && !process?.exhausted ? null : current
        const initial = store.getSnapshot()
        const book = wordBooks.find(b => b.id === (existing?.wordBookId ?? (mode === 'extra' ? daily?.wordBookId : initial.settings.todayWordBookId)))
        if (!book) throw Error('book unavailable')
        if (process?.exhausted) {
          setLoaded({ date, taskId: existing?.taskId, book, session: null, words: new Map() })
          setClock(date)
          return
        }
        const session = await loadBook(book)
        const ids = existing ? existing.itemIds.map(id => existing.items[id].wordId)
          : [...new Set((await session.loadLearningOrder()).map(wordId))]
            .filter(id => !store.getWord(book.id, id)?.learning.completed).slice(0, mode === 'extra' ? EXTRA_LEARNING_BATCH_SIZE : initial.settings.dailyNewWords)
        const details = await session.loadWords(ids)
        const words = new Map(details.map(item => [wordId(item.word), item]))
        if (ids.some(id => !words.has(id))) throw Error('Word book details are missing')
        if (cancelled || exitRequested.current) return
        loading = false
        if (store.getToday() !== date) throw Error('Learning date changed')
        if (mode !== 'extra' && !existing && store.getSnapshot() !== initial) throw Error('Learning settings changed')
        if (exitRequested.current) return
        const savedTask = mode === 'extra'
          ? existing ?? await store.ensureExtraLearning(ids, date)
          : existing ?? await store.ensureTodayLearning(book.id, ids, date, initial.settings, { id: 'guided-recall', rulesVersion: 1 })
        if (cancelled || exitRequested.current) return
        setLoaded({ date: savedTask?.date ?? date, taskId: savedTask?.taskId, book, session, words })
        setClock(store.getToday())
      } catch (failure) {
        if (!cancelled && !exitRequested.current) setError(messageFor(failure, loading, review))
      } finally {
        if (!cancelled && !exitRequested.current) setBusy(false)
      }
    }
    start()
    return () => { cancelled = true }
  }, [store, loadBook, attempt, mode, review, exiting])

  useEffect(() => {
    if (!exitRequested.current && mode === 'extra' && loaded && task && task.taskId === loaded.taskId && task.currentItemId === null
      && !extra.exhausted && !busy && !error && !expired) {
      setLoaded(null)
      setAttempt(value => value + 1)
    }
  }, [mode, loaded, task, extra, busy, error, expired, exiting])

  useEffect(() => {
    if (exitRequested.current) return
    if (!reviewAudioReady) return
    if (mode === 'extra' && store.getExtraLearningProcess()?.exhausted) return
    let cancelled = false
    if (mode === 'review') setAudio(null)
    setAudioError(false)
    loadAudioManifest().then(value => { if (!cancelled && !exitRequested.current) setAudio(value) }).catch(() => { if (!cancelled && !exitRequested.current) setAudioError(true) })
    return () => { cancelled = true }
  }, [attempt, mode, store, exiting, reviewAudioReady])

  useEffect(() => {
    if (exitRequested.current) return
    if (!loaded || !task || !['guided-recall', REVIEW_GUIDED_RECALL.id].includes(task.method?.id) || task.view !== 'question' || task.choice || !task.currentItemId || expired || error) return
    if (task.kind === 'extra-learning' && task.taskId !== loaded.taskId) return
    const progress = task.items[task.currentItemId]
    if (progress.knownCount !== 0) return
    let cancelled = false
    async function prepare() {
      let loading = true
      setBusy(true)
      try {
        const order = await loaded.session.loadLearningOrder()
        if (cancelled || exitRequested.current) return
        const pool = await loaded.session.loadWords(order.slice(0, 80))
        if (cancelled || exitRequested.current) return
        const options = learningChoices(loaded.words.get(progress.wordId), pool)
        loading = false
        if (exitRequested.current) return
        await (review ? store.prepareReviewChoice : store.prepareLearningChoice)(turnToken(task), options)
      } catch (failure) { if (!cancelled && !exitRequested.current) setError(messageFor(failure, loading, review)) }
      finally { if (!exitRequested.current) setBusy(false) }
    }
    prepare()
    return () => { cancelled = true }
  }, [loaded, task, store, exiting, review, expired, error])

  const act = async (feedback, action = 'self') => {
    if (pending.current || exitRequested.current || entering || !task) return
    pending.current = true
    setBusy(true)
    setError('')
    cancelSpeechScope(speechScope.current)
    try {
      const token = turnToken(task)
      if (store.getToday() !== task.date) throw Error('Learning date changed')
      if (action === 'choice') await (review ? store.submitReviewChoice : store.submitLearningChoice)(token, feedback)
      else if (action === 'reveal') await (review ? store.revealReviewDetails : store.revealLearningDetails)(token)
      else if (action === 'correct') await (review ? store.correctReviewFeedback : store.correctLearningFeedback)(token)
      else if (feedback) await (review ? store.submitReviewFeedback : store.submitSelfAssessment)(token, feedback)
      else { await (review ? store.advanceReview : store.advanceLearning)(token); setNextTurn(value => value + 1) }
    } catch (failure) {
      setError(messageFor(failure, false, review))
    } finally {
      pending.current = false
      setBusy(false)
      setClock(store.getToday())
    }
  }
  const restart = () => {
    if (exitRequested.current) return
    try {
      store.reload()
      if (review) { setAudio(null); setAudioError(false) }
      if (expired && !review) setMode('learning')
      setLoaded(null)
      setError('')
      setAttempt(value => value + 1)
    } catch { setError('学习记录暂时无法读取，原始数据已保留。请检查浏览器存储权限后重新读取。') }
  }
  const exitTask = task ?? (mode === 'extra' ? store.getExtraLearning() : store.getTask(review ? 'review' : 'learning'))
  const remaining = exitTask ? Object.values(exitTask.items).filter(entry => !entry.completed && !entry.removed).length : 0
  const beginExit = () => {
    if (pending.current || exitRequested.current) return
    pending.current = true
    exitRequested.current = true
    cancelSpeechScope(speechScope.current)
    setConfirmExit(false)
    setExiting(true)
  }
  const requestExit = () => {
    if (pending.current || exitRequested.current) return
    if (remaining > 0) setConfirmExit(true)
    else beginExit()
  }
  const corrected = task?.view === 'feedback' && task.feedbackEvents.at(-1)?.source === (review ? 'review-feedback-correction' : 'feedback-correction')
  const progress = task?.items[task.currentItemId]
  const item = progress && loaded.words.get(progress.wordId)
  const hasItem = Boolean(item)
  useEffect(() => {
    if (initialWordReady || !hasItem || exiting) return
    const timer = window.setTimeout(() => setInitialWordReady(true), 240)
    return () => window.clearTimeout(timer)
  }, [initialWordReady, hasItem, exiting])
  const complete = mode === 'extra' ? extra?.exhausted : task && task.currentItemId === null
  const guided = ['guided-recall', REVIEW_GUIDED_RECALL.id].includes(task?.method?.id)
  const chineseQuestion = review && task?.view === 'question' && progress?.knownCount === 3
  const maxKnown = review ? 4 : 3
  const choiceFeedback = guided && task.view === 'feedback' && task.choice && !task.choice.revealed
  const choosing = guided && task.view === 'question' && progress?.knownCount === 0
  const example = item && (item.example?.trim() || supplementalExamples[item.word.toLowerCase()]?.example)
  const wordAudio = item && audio?.words?.[item.word.toLowerCase()]
  const wordFrame = item ? `${task.date}:${task.taskId ?? mode}:${task.currentItemId}:${nextTurn}:${chineseQuestion ? 'zh' : 'en'}` : ''
  const bodyPhase = choosing || choiceFeedback || task?.view === 'question' ? 'question' : 'details'
  const bodyFrame = `${wordFrame}:${bodyPhase}`
  const speechKey = `${wordFrame}:${task?.view}:${choiceFeedback ? task.choice.selectedWord : bodyPhase}`
  const wrongChoice = choiceFeedback && task.choice.selectedWord !== progress.wordId
  const startSpeech = () => {
    if (chineseQuestion || exitRequested.current || !item) { cancelSpeechScope(speechScope.current); return }
    const target = { text: item.word, lang: task.settings.pronunciation, src: wordAudio?.[task.settings.pronunciation] }
    const selected = task.choice?.selectedWord
    const sequence = wrongChoice
      ? [{ text: selected, lang: task.settings.pronunciation, src: audio?.words?.[selected]?.[task.settings.pronunciation] }, target]
      : [target]
    if (!choiceFeedback && (bodyPhase === 'details' || guided && progress.knownCount === 1) && example) {
      sequence.push({ text: example, lang: 'en-US', src: wordAudio?.example })
    }
    playSpeechSequence(sequence, { scope: speechScope.current,
      onSegment: index => { if (choiceFeedback && index === (wrongChoice ? 1 : 0)) setCorrectPhase(speechKey) },
      onState: state => setSpeechState({ key: speechKey, state }),
      onCancel: () => { if (choiceFeedback) setCorrectPhase(speechKey) },
    })
  }
  speechConfig.current = startSpeech
  const speechReady = Boolean(item && !chineseQuestion && initialWordReady && (audio !== null || audioError) && !error && !expired && !exiting && !entering && readyWord === wordFrame && readyBody === bodyFrame)
  useEffect(() => {
    if (speechReady) speechConfig.current()
    const scope = speechScope.current
    return () => cancelSpeechScope(scope)
  }, [speechKey, speechReady])
  useEffect(() => { if (choiceFeedback && !busy) footer.current?.querySelector('button')?.focus({ preventScroll: true }) }, [choiceFeedback, busy])
  const playbackMessage = speechState.key === speechKey ? speechMessage(speechState.state, task?.settings.pronunciation, Boolean(wordAudio?.[task?.settings.pronunciation])) : ''
  const notice = (error || expired) && <div ref={alert} tabIndex={-1} role="alert"><p>{expired ? '日期已变化。昨日进度已保留，请开始今天的任务。' : error}</p>
    <button type="button" disabled={busy} onClick={restart}>{expired ? '开始今天的任务' : loaded || /记录/.test(error) && !/词书/.test(error) ? '重新读取进度' : '重试'}</button>
  </div>
  return <section className={`learning-session ${exiting ? 'is-exiting' : entering ? 'is-entering' : ''}`} inert={exiting || entering} aria-label={review ? '今日复习练习' : mode === 'extra' ? '额外学习练习' : '今日学习练习'} aria-busy={busy}>
    <header className="learning-session__header">
      <button type="button" ref={exitButton} onClick={requestExit} disabled={pending.current}>返回主界面</button>
      <p>{loaded ? `${loaded.book.label}${review ? ' · 今日复习' : mode === 'extra' ? ' · 额外学习' : ''}` : review ? '准备今日复习' : '准备今日学习'}{task && <span>{mode === 'extra' ? '本组' : ''}已完成 {Object.values(task.items).filter(entry => entry.completed).length} / {task.itemIds.length} 词</span>}</p>
    </header>
    {(!item || expired) && notice}
    <LoadingIndicator active={busy && !loaded && !error && !expired && !exiting} label={review ? '正在准备复习' : '正在准备学习'} />
    {!expired && complete && <div className="learning-session__empty"><h2 ref={heading} tabIndex={-1}>{review ? task.itemIds.length ? '今日复习已完成' : Object.values(snapshot.wordBooks[task.wordBookId]?.words ?? {}).some(word => word.learning.completed || word.review) ? '还没有到期词' : '还没有学过的词' : mode === 'extra' || !task.itemIds.length ? '这本词书已全部学完' : '今日学习已完成'}</h2><p>进度已保存。当天任务保持不变，新的设置从下次创建任务时生效。</p>{review && !task.itemIds.length && <p>先学习新词，已学词到期后会出现在复习中。</p>}</div>}
    {!expired && item && <StudyTransition transitionKey={wordFrame} onReady={setReadyWord} waitForEntry={review}>
      <article className="learning-session__word">
        <div className="learning-session__word-heading">
          <h2 ref={heading} tabIndex={-1} className={chineseQuestion ? 'learning-session__meaning-heading' : undefined} lang={chineseQuestion ? 'zh-CN' : 'en'}>{chineseQuestion ? item.meaning || '暂无释义' : item.word}</h2>
          <p className="learning-session__count" aria-label={`今日认识 ${progress.knownCount} / ${maxKnown} 次`}>{Array.from({ length: maxKnown }, (_, i) => i + 1).map(n => <span key={n} className={progress.knownCount >= n ? 'is-filled' : ''} />)}<span className="learning-session__count-text">{progress.knownCount} / {maxKnown}</span></p>
        </div>
        <div ref={body} className="learning-session__body" tabIndex={0} role="region" aria-label="单词内容">
          {notice}
          <StudyTransition content transitionKey={bodyFrame} waitForEntry={review} onReady={key => {
            setReadyBody(key)
            if (bodyPhase === 'details') body.current?.focus({ preventScroll: true })
          }}>
          {!chineseQuestion && <div className="learning-session__playback"><button type="button" aria-label="重播本轮朗读" disabled={!speechReady} onClick={startSpeech}>重播朗读</button></div>}
          {(choosing || choiceFeedback) ? <>
            <p className="learning-session__phonetic">{item.phonetic}</p>
            <p className="learning-session__hint">先回想词义，再选择；不确定可以看答案。</p>
            {task.choice ? <div className="learning-session__choices">{task.choice.options.map(option => {
              const correct = choiceFeedback && correctPhase === speechKey && option.word === progress.wordId
              const wrong = choiceFeedback && option.word === task.choice.selectedWord && option.word !== progress.wordId
              return <button key={option.word} type="button" className={`${correct ? 'is-correct' : ''} ${wrong ? 'is-wrong' : ''}`} disabled={busy || choiceFeedback} onClick={() => act(option.word, 'choice')}>
                <span>{option.meaning}</span><small className={correct || wrong ? '' : 'is-reserved'} aria-hidden={!(correct || wrong)}>{correct ? '正确答案' : '你的选择'} · {option.word}</small>
              </button>
            })}</div> : !error && <LoadingIndicator compact label="正在准备选项…" />}
          </> : task.view === 'question' ? <>
            {chineseQuestion && <p className="learning-session__hint" lang="zh-CN">根据中文回想英文单词，再选择你的熟悉程度。</p>}
            {guided && progress.knownCount === 1 && <p className="learning-session__example" lang="en">{example || '该词暂无英文例句，请直接回想词义。'}</p>}
            {!guided && <p className="learning-session__hint">先回想词义，再选择你的熟悉程度。</p>}
          </> : <>
            <p className="learning-session__saved" role="status">{corrected ? '已更正：模糊，认识次数减 1' : task.choice ? (task.choice.selectedWord === progress.wordId ? '首次选对，认识次数加 1' : '已查看答案，本次不增加认识次数') : `已保存：${({ known: '认识', fuzzy: '模糊', unknown: '不认识' })[progress.lastFeedback]}`}{progress.completed ? ' · 本词已完成' : ''}</p>
            <LearningDetails item={item} audio={wordAudio} pronunciation={task.settings.pronunciation} speechScope={speechScope.current} />
            {review && <p className="learning-session__saved">{progress.completed ? `下次复习：${formatReviewDate(store.getWord(task.wordBookId, progress.wordId)?.review?.nextReviewAt)}` : '继续复习本词'}</p>}
            {audioError && <p>发音资源暂时无法加载，可退出后重试；可用时使用浏览器发音。</p>}
            {snapshot.mistakes[progress.wordId]?.entered && !snapshot.mistakes[progress.wordId].removed && <p>已记录到错误证据库。</p>}
          </>}
          {!chineseQuestion && <p className="learning-session__speech-status" role="status">{playbackMessage}</p>}
          </StudyTransition>
        </div>
        <footer ref={footer} className="learning-session__footer">
          {choosing ? <button type="button" disabled={busy || !task.choice} onClick={() => act(null, 'choice')}>看答案</button>
            : choiceFeedback ? <button className="learning-session__next" type="button" disabled={busy} onClick={() => act(null, 'reveal')}>继续</button>
            : task.view === 'question' ? <div className="learning-session__actions">{[['known', '认识'], ['fuzzy', '模糊'], ['unknown', '不认识']].map(([value, label]) =>
              <button type="button" key={value} onClick={() => act(value)} disabled={busy}>{label}</button>)}</div>
            : <>{((review ? canCorrectReviewFeedback(task) : canCorrectLearningFeedback(task)) || corrected) && <button type="button" disabled={busy || corrected || readyBody !== bodyFrame} onClick={() => act(null, 'correct')}>{corrected ? '已更正' : '记错了'}</button>}<button className="learning-session__next" type="button" onClick={() => act()} disabled={busy}>下一词</button></>}
        </footer>
      </article>
    </StudyTransition>}
    {confirmExit && <ExitConfirmation returnFocus={exitButton} remaining={remaining} extra={mode === 'extra'} review={review} onCancel={() => setConfirmExit(false)} onConfirm={beginExit} />}
  </section>
}
function ExitConfirmation({ returnFocus, remaining, extra, review, onCancel, onConfirm }) {
  const dialog = useRef(null)
  useEffect(() => {
    const previous = returnFocus.current
    dialog.current.showModal()
    return () => previous?.focus({ preventScroll: true })
  }, [returnFocus])
  return <dialog ref={dialog} className="learning-session__exit-dialog" aria-labelledby="learning-exit-title" aria-describedby="learning-exit-description" onCancel={event => { event.preventDefault(); onCancel() }}>
    <h2 id="learning-exit-title">{review ? '退出本次复习？' : '退出本次学习？'}</h2>
    <p id="learning-exit-description">{extra ? '本组' : '当前任务'}剩余 {remaining} 词。进度已保存，下次可以继续。</p>
    <div className="learning-session__actions">
      <button type="button" autoFocus onClick={onCancel}>{review ? '继续复习' : '继续学习'}</button>
      <button type="button" onClick={onConfirm}>确认退出</button>
    </div>
  </dialog>
}

function formatReviewDate(value) {
  if (!value) return '暂无日期'
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function LearningDetails({ item, audio, pronunciation, speechScope }) {
  const supplement = !item.example?.trim() ? supplementalExamples[item.word.toLowerCase()] : null
  const example = supplement?.example ?? item.example
  const translation = supplement?.translation ?? item.translation
  const langs = pronunciation === 'en-US' ? ['en-US', 'en-GB'] : ['en-GB', 'en-US']
  return <div className="learning-session__details">
    <p>{item.phonetic} {describePartOfSpeech(item.partOfSpeech ?? '')}</p>
    <div className="learning-session__actions">{langs.map(lang => <SpeechButton key={lang} scope={speechScope} word={item.word} lang={lang} src={audio?.[lang]} label={lang === 'en-GB' ? '英音' : '美音'} accessibleLabel={`${item.word} ${lang === 'en-GB' ? '英音' : '美音'}`} />)}</div>
    <div className="learning-session__detail-grid"><section><h3>释义</h3><p>{item.meaning || '暂无释义'}</p></section><section>
    <h3>{supplement ? '补充例句' : '例句'}</h3><p lang="en">{example || '暂无例句'}</p>
    {translation && <p>{translation}</p>}
    {supplement && item.word === 'reservior' && <p>例句采用规范拼写 reservoir。</p>}
    {example && <SpeechButton scope={speechScope} word={example} src={audio?.example} label="朗读例句" />}
    </section><section className="learning-session__phrases"><h3>词组</h3>{item.phrases?.length ? <ul>{item.phrases.map((phrase, index) => <li key={index}>{phrase}</li>)}</ul> : <p>暂无词组</p>}</section></div>
  </div>
}
