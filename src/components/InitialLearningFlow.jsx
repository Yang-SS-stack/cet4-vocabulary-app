import { useState } from 'react'
import { useLearningStore } from '../data/learning'
import { buildLearningFacts } from '../data/assistant/facts'
import { adviceAvailability } from '../data/assistant/sessionAdvice'
import { wordBooks } from '../data/wordBooks'
import LearningSetupModal from './LearningSetupModal'
import SessionAdviceModal from './SessionAdviceModal'
import SessionDialog from './SessionDialog'
import SessionIntentControls from './SessionIntentControls'
import './SessionAdviceModal.css'

export default function InitialLearningFlow({ onClose, onStart, now, saveSettings }) {
  const { store, snapshot } = useLearningStore()
  const [stage, setStage] = useState('setup')
  const [intent, setIntent] = useState({ availableMinutes: Math.max(5, Math.min(60, snapshot.settings.dailyStudyMinutes ?? 30)), goal: 'progress' })
  if (stage === 'setup') return <LearningSetupModal mode="initial" presentation="session" settings={snapshot.settings} snapshot={snapshot} now={now}
    onSave={saveSettings ?? (patch => store.updateSettings(patch))} onSaved={() => setStage('invite')} onClose={onClose}
    beforeFields={draft => <div className="session-start-preferences"><SetupAvailability store={store} draft={draft} now={now} />
      <SessionIntentControls intent={intent} onChange={setIntent} /></div>} />
  if (stage === 'advice') return <SessionAdviceModal now={now} initialIntent={intent} onClose={() => setStage('invite')} onStart={onStart} />
  return <SessionDialog title="要看看助手的学习建议吗？" onClose={onClose} className="session-dialog--invite"
    footer={<><button type="button" className="session-primary" onClick={() => setStage('advice')}>查看助手学习建议</button>
      <button type="button" className="session-text" onClick={onStart}>暂不需要，直接开始学习</button></>}>
    <div className="session-invitation"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 10h28v22H22l-9 7v-7h-3zM18 18h12M18 24h8" /></svg>
      <p>根据你的时间和学习目标，帮你合理安排今天的新词与复习。</p>
      <p className="session-note">设置已保存。建议可选；本轮提供规则推荐。</p>
    </div>
  </SessionDialog>
}

function SetupAvailability({ store, draft, now }) {
  try {
    const { snapshot } = store.readAssistantSnapshot()
    const preview = { ...snapshot, settings: draft }
    const facts = buildLearningFacts(preview, { now: now ?? new Date(), wordBooks, selectedWordBookId: draft.todayWordBookId })
    const available = adviceAvailability(facts, draft)
    return <section className="session-availability" aria-label="今日剩余量">
      <div><span>今日剩余新词</span><strong>{available.newWords ?? '待核对'}{available.newWords !== null && <small> 词</small>}</strong></div>
      <div><span>今日待复习</span><strong>{available.reviewWords ?? '待核对'}{available.reviewWords !== null && <small> 词</small>}</strong></div>
      <p>{available.message ?? '已建任务读取冻结剩余；未建任务按设置草稿估算可安排量。'}</p>
    </section>
  } catch { return <p role="status">学习记录已变化或无法读取，请重新载入页面核对。</p> }
}
