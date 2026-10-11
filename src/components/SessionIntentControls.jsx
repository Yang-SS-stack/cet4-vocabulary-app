import { useId } from 'react'
import { SESSION_GOALS } from '../data/assistant/sessionAdvice'

const descriptions = { progress: '兼顾新词与复习，保持今天的学习节奏', review: '先巩固到期词汇，再用剩余时间学习新词', lighter: '减少本次安排，留出更充裕的学习时间' }
export default function SessionIntentControls({ intent, onChange, disabled = false, goalDescriptions = false }) {
  const id = useId()
  return <section className="session-intent" aria-label="本次时间与目标">
    <div className="session-intent__time">
      <label htmlFor={id}>本次可用时间</label>
      <output htmlFor={id}><strong>{intent.availableMinutes}</strong> 分钟</output>
    </div>
    <input id={id} type="range" min="5" max="60" step="1" value={intent.availableMinutes} disabled={disabled}
      style={{ '--range-fill': `${(intent.availableMinutes - 5) / 55 * 100}%` }}
      onChange={event => onChange({ ...intent, availableMinutes: Number(event.target.value) })} />
    <div className="session-intent__range-labels" aria-hidden="true"><span>5 分钟</span><span>60 分钟</span></div>
    <fieldset disabled={disabled}>
      <legend>本次目标</legend>
      <div className="session-intent__goals">{SESSION_GOALS.map(goal => <button key={goal.id} type="button" aria-pressed={intent.goal === goal.id}
        aria-label={goalDescriptions ? goal.label : undefined} onClick={() => onChange({ ...intent, goal: goal.id })}>{goalDescriptions ? <span><strong>{goal.label}</strong><small>{descriptions[goal.id]}</small></span> : goal.label}</button>)}</div>
    </fieldset>
    <p className="session-note">仅用于本次建议；每日计划保持独立。</p>
  </section>
}
