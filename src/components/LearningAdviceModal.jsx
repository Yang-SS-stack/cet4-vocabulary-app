import { useEffect, useId, useRef, useState } from 'react'
import './LearningAdviceModal.css'

const format = value => new Intl.NumberFormat('zh-CN').format(value)
export default function LearningAdviceModal({ recommendation, settings, bookLabel, daysLabel, planResult, returnFocus, onClose, children }) {
  const dialog = useRef(null)
  const closeButton = useRef(null)
  const tabs = useRef([])
  const animation = useRef(null)
  const closing = useRef(false)
  const closeCallback = useRef(onClose)
  closeCallback.current = onClose
  const [tab, setTab] = useState(0)
  const id = useId()
  const media = useRef(null)

  function cancelAnimation() {
    const current = animation.current
    animation.current = null
    if (current) { current.onfinish = null; current.cancel() }
  }
  function completeClose() {
    cancelAnimation()
    closeCallback.current()
  }
  function dismiss() {
    if (closing.current) return
    closing.current = true
    const node = dialog.current
    const visible = window.getComputedStyle(node)
    const from = { opacity: visible.opacity || '1', transform: visible.transform === 'none' ? 'translateY(0)' : visible.transform }
    cancelAnimation()
    if (media.current?.matches || document.hidden || !node.animate) { completeClose(); return }
    try {
      const current = node.animate([from, { opacity: 0, transform: 'translateY(8px)' }], { duration: 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' })
      animation.current = current
      current.onfinish = () => { if (animation.current === current) completeClose() }
    } catch { completeClose() }
  }

  useEffect(() => {
    const node = dialog.current
    const body = document.body
    const x = window.scrollX, y = window.scrollY
    const previous = document.activeElement
    const trigger = returnFocus.current
    const saved = ['overflow', 'padding-right'].map(property => [property, body.style.getPropertyValue(property), body.style.getPropertyPriority(property)])
    const gap = Math.max(0, window.innerWidth - document.documentElement.clientWidth)
    const reservesGutter = window.getComputedStyle(document.documentElement).scrollbarGutter?.split(/\s+/).includes('stable')
    const padding = parseFloat(window.getComputedStyle(body).paddingRight) || 0
    body.style.setProperty('overflow', 'hidden')
    if (gap && !reservesGutter) body.style.setProperty('padding-right', `${padding + gap}px`)
    node.showModal()
    closeButton.current?.focus({ preventScroll: true })
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    media.current = preference
    function settle() {
      if (!preference?.matches && !document.hidden) return
      cancelAnimation()
      if (closing.current) completeClose()
    }
    preference?.addEventListener?.('change', settle)
    document.addEventListener('visibilitychange', settle)
    if (!preference?.matches && !document.hidden && node.animate) {
      try {
        const current = node.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' })
        animation.current = current
        current.onfinish = () => { if (animation.current === current) cancelAnimation() }
      } catch { cancelAnimation() }
    }
    return () => {
      cancelAnimation()
      preference?.removeEventListener?.('change', settle)
      document.removeEventListener('visibilitychange', settle)
      if (node.open) node.close()
      for (const [property, value, priority] of saved) {
        if (value) body.style.setProperty(property, value, priority)
        else body.style.removeProperty(property)
      }
      window.scrollTo(x, y)
      const target = trigger ?? previous
      if (target?.isConnected) target.focus({ preventScroll: true })
    }
  }, [returnFocus])

  function choose(index, focus = false) {
    setTab(index)
    if (focus) tabs.current[index]?.focus()
  }
  function tabKey(event) {
    const next = { ArrowRight: (tab + 1) % 2, ArrowLeft: (tab + 1) % 2, Home: 0, End: 1 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    choose(next, true)
  }
  const system = !recommendation ? '无法计算' : recommendation.remainingWords === 0 ? '新词已完成' : recommendation.recommendedDailyWords === null ? recommendation.daysRemaining !== null && recommendation.daysRemaining <= 0 ? '不适用：考试日期为今天或已过去' : '设置未来考试日期后计算' : format(recommendation.recommendedDailyWords)
  const estimated = recommendation?.estimatedMinutes
  const notice = !recommendation ? '规则建议无法计算：请选择词书并核对词书资料。' : planResult
  return <dialog ref={dialog} className="learning-advice-modal" aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); dismiss() }}>
    <header className="learning-advice-modal__header">
      <div><h2 id={`${id}-title`}>学习建议</h2><p>根据当前目标与设置</p></div>
      <button ref={closeButton} type="button" className="learning-advice-modal__close" aria-label="关闭学习建议" onClick={dismiss}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
    </header>
    <div className="learning-advice-modal__tabs" role="tablist" aria-label="学习建议内容">
      {['建议', '依据'].map((text, index) => <button key={text} ref={node => { tabs.current[index] = node }} id={`${id}-tab-${index}`} type="button" role="tab" aria-selected={tab === index} aria-controls={`${id}-panel-${index}`} tabIndex={tab === index ? 0 : -1} onClick={() => choose(index)} onKeyDown={tabKey}>{text}</button>)}
    </div>
    <div className="learning-advice-modal__body">
      <section id={`${id}-panel-0`} role="tabpanel" aria-labelledby={`${id}-tab-0`} hidden={tab !== 0} tabIndex={0}>
        {tab === 0 && <>
        <div className="learning-advice-modal__context"><span>当前词书 <strong>{bookLabel}</strong></span><span>距离考试 <strong>{daysLabel}</strong></span></div>
        <dl className="learning-advice-modal__metrics">
          <AdviceMetric label="系统建议每日新词" value={system} unit={Number.isSafeInteger(recommendation?.recommendedDailyWords) && recommendation?.remainingWords !== 0 ? '词 / 天' : null} />
          <AdviceMetric label="当前每日新词" value={settings.dailyNewWords === null ? '未设置' : format(settings.dailyNewWords)} unit={settings.dailyNewWords === null ? null : '词 / 天'} />
          <AdviceMetric label="按当前设置估算" value={Number.isFinite(estimated) ? `约 ${format(estimated)}` : '无法估算'} unit={Number.isFinite(estimated) ? '分钟 / 天' : null} />
        </dl>
        <p className="learning-advice-modal__estimate">按当前设置估算，不含额外学习，不是实际计时。</p>
        <p className={`learning-advice-modal__notice ${!recommendation || recommendation.exceedsDailyWordLimit || (recommendation.deadlineDailyWords !== null && settings.dailyNewWords !== null && settings.dailyNewWords < recommendation.deadlineDailyWords) ? 'learning-advice-modal__notice--warning' : ''}`}>{notice}</p>
        {recommendation?.exceedsDailyWordLimit && <p className="learning-advice-modal__limit">按当前日期和剩余词量，考试前可能无法完成，请调整考试日期或学习计划。</p>}
        <section className="learning-advice-modal__methods" aria-label="学习方法"><h3>学习方法</h3><p><MethodIcon />间隔学习与主动回忆</p><p><MethodIcon review />在设定数量内优先复习逾期词</p></section>
        </>}
      </section>
      <section id={`${id}-panel-1`} role="tabpanel" aria-labelledby={`${id}-tab-1`} hidden={tab !== 1} tabIndex={0}>{tab === 1 && children}</section>
    </div>
    <footer className="learning-advice-modal__footer"><p>规则建议 · 不会自动修改计划。</p><button type="button" onClick={dismiss}>我知道了</button></footer>
  </dialog>
}
function AdviceMetric({ label, value, unit }) {
  return <div><dt>{label}</dt><dd><strong className={unit ? '' : 'learning-advice-modal__text-value'}>{value}</strong>{unit && <span>{unit}</span>}</dd></div>
}
function MethodIcon({ review = false }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{review ? <path d="M20 8a8 8 0 0 0-14-2L3 9m0-6v6h6M4 16a8 8 0 0 0 14 2l3-3m0 6v-6h-6" /> : <path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1m0-15c3-2 6-2 9-1v15c-3-1-6-1-9 1V5" />}</svg>
}
