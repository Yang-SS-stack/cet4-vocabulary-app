const states = {
  disabled: 'AI 建议尚未启用，仍可使用规则推荐。',
  ready: 'AI 已就绪；点击生成才会请求服务，是否调用模型由服务端决定。',
  running: '服务正在处理请求，请等待或使用规则推荐。',
  'awaiting-quota-check': '需先核查免费额度与有效期，再由服务恢复 AI 建议。',
  'quota-unavailable': '免费额度当前不可用，请核查余量与有效期。',
  'limit-reached': '当前可请求次数已达上限，仍可使用规则推荐。',
  blocked: 'AI 服务当前不可用，请检查服务配置；仍可按原设置学习。',
}

export function modelPresentation(state, configured) {
  if (!configured) return { ready: false, message: 'AI 尚未接入；重新计算规则不会调用模型。', details: [] }
  const known = state && Object.hasOwn(states, state.status)
  const revision = typeof state?.revision === 'string' && state.revision.trim() && state.revision.length <= 128 ? state.revision : null
  const details = []
  for (const [key, label] of [['minute', '当前分钟'], ['day', '今日'], ['phase', '本阶段']]) {
    const remaining = state?.remainingAttempts?.[key]
    if (known && revision && Number.isSafeInteger(remaining) && remaining >= 0) details.push(`${label}剩余可请求 ${remaining} 次`)
  }
  if (known && revision && Number.isSafeInteger(state.retryAfterSeconds) && state.retryAfterSeconds >= 0) details.push(`服务提示需等待 ${state.retryAfterSeconds} 秒`)
  return {
    ready: known && state.status === 'ready' && Boolean(revision), revision, details,
    message: known && revision ? states[state.status] : '模型状态暂时无法确认，仍可使用规则推荐。',
  }
}

const errors = {
  TIMEOUT: '等待超时。需先核查免费额度与有效期，再恢复 AI 请求。当前保留规则推荐。',
  QUOTA_EXHAUSTED: '模型免费额度已用尽，请核查控制台余量与有效期。当前保留规则推荐。',
  QUOTA_EXPIRED: '模型免费额度已过期，请核查有效期。当前保留规则推荐。',
  QUOTA_CHECK_REQUIRED: '需先核查免费额度与有效期，再恢复 AI 请求。当前保留规则推荐。',
  NETWORK: '连接失败。需先核查免费额度与有效期，再恢复 AI 请求。当前保留规则推荐。',
  RESPONSE_INVALID: '建议未通过响应、数量或时间检查。需先核查后再恢复 AI 请求，当前保留规则推荐。',
  BUSY: '服务正在处理另一请求，本次未排队。仍可使用规则推荐。',
  RATE_LIMITED: '请求过于频繁，请等待服务恢复；仍可使用规则推荐。',
  LIMIT_REACHED: '当前可请求次数已达上限，仍可使用规则推荐。',
  AUTH_REQUIRED: '服务连接已失效，请重新连接；仍可按原设置学习。',
  MODEL_DISABLED: states.disabled,
  MODEL_BLOCKED: states.blocked,
  REQUEST_CONFLICT: '请求信息发生冲突，请核对服务状态；当前保留规则推荐。',
}
export function modelErrorMessage(code) {
  return Object.hasOwn(errors, code) ? errors[code] : '暂时无法生成 AI 建议。请核对服务状态与免费额度，当前保留规则推荐。'
}
