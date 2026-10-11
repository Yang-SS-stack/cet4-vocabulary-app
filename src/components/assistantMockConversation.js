// All conversation text is simulated here. A future conversation provider can
// replace this adapter; local rules and store actions remain separate authorities.
export const ASSISTANT_CAPABILITIES = Object.freeze([
  { id: 'plan', request: '学习计划', icon: 'plan' },
  { id: 'memory', request: '单词记忆', icon: 'memory' },
  { id: 'exercise', request: '专属练习', icon: 'exercise' },
  { id: 'question', request: '学习答疑', icon: 'question' },
])
export const ASSISTANT_WELCOME = `👋 你好！我是你的 LinguaJet 学习助手！

从今天起，我会陪你一起轻松、高效地学英语！🚀

📅 学习计划：根据你的空闲时间和学习进度，灵活安排每天的学习任务。

💡 单词记忆：遇到难记的单词，我可以结合词义、趣味联想和真实语境，帮你找到更容易记住的方法。

📝 专属练习：根据你的学习情况和薄弱环节，为你设计有针对性的练习题。

💬 学习答疑：有任何英语学习上的疑问，都可以随时问我！

那么，今天要为自己制定一个特别的学习计划吗？ ✨`
export function mockAssistantReply(request = 'greeting') {
  switch (request) {
    case 'greeting': return { text: ASSISTANT_WELCOME, stage: 'conversation' }
    case '否，暂时不用': return { text: '那么你现在想要做些什么？', stage: 'conversation' }
    case '是，设置计划':
    case '设置学习计划': return { text: '已准备本次规则建议草稿。接下来一起核对时间、目标和数量，你也可以继续调整。', stage: 'plan', goal: 'progress' }
    case '安排复习': return { text: '已准备优先复习的规则建议草稿。接下来一起核对时间和数量，采用前还可以调整。', stage: 'plan', goal: 'review' }
    case '今日任务': return { text: '以下摘要来自当前学习记录；查看不会创建任务。', stage: 'tasks' }
    default: return { text: '这是模拟回复，当前无法理解或处理任意请求。你可以选择下方的提示请求。谐音和联想记忆尚未开放。', stage: 'conversation' }
  }
}

const yes = text => /^(?:是|是，设置计划|好的|确认)$/.test(text)
const no = text => /^(?:否|否，暂时不用|不用|暂时不用)$/.test(text)
const validMinutes = minutes => Number.isInteger(minutes) && minutes >= 5 && minutes <= 60
const invalidTime = minutes => !Number.isInteger(minutes) ? '请使用整数分钟，输入 5～60 分钟。' : minutes < 5 ? '本次至少需要 5 分钟，请输入 5～60 分钟。' : '本次最多安排 60 分钟，请输入 5～60 分钟。'
const minutesFrom = text => {
  const match = text.match(/^(?:(?:我)?(?:这次)?(?:准备|打算|想)?(?:学习|学)?\s*)?(\d+(?:\.\d+)?)\s*(?:分钟|分|min(?:utes?)?)$/i)
  return match ? Number(match[1]) : null
}
const clarifiedMinutesFrom = text => /^-?\d+(?:\.\d+)?$/.test(text) ? Number(text) : minutesFrom(text)
const targetFrom = text => {
  const match = text.match(/^(?:(?:帮我记住|记住|单词记忆)\s*)?([a-z]+(?:['-][a-z]+)*)[.!。！]?$/i)
  return match?.[1] ?? null
}

// Session state is conversation intent only. Lesson facts are supplied readonly
// and copied into each request here; history never supplies a new request target.
export function resolveAssistantRequest(text, { intent, currentLesson, selection } = {}, state = {}) {
  const explicit = text.trim()
  const next = { ...state }
  const reply = (message, stage = 'conversation', extra = {}) => ({ text: message, stage, ...extra, session: next, userText: explicit })
  const plan = goal => {
    next.pending = null; next.goal = goal
    if (!validMinutes(next.minutes)) {
      next.pending = 'time'
      return reply('你这次准备学习多少分钟？', 'time')
    }
    return { ...reply(mockAssistantReply(goal === 'review' ? '安排复习' : '设置学习计划').text, 'plan'), goal, availableMinutes: next.minutes }
  }
  const planWithTime = explicit.match(/^(学习计划|设置学习计划|是，设置计划|安排复习)\s*(\d+(?:\.\d+)?\s*分钟)$/)
  // Supported current requests outrank chip fallbacks and older clarifications.
  const explicitAction = planWithTime ? planWithTime[1] === '安排复习' ? 'review' : 'plan' : /^帮我记住\s*/.test(explicit) ? 'memory' : ({ '学习计划': 'plan', '设置学习计划': 'plan', '是，设置计划': 'plan', '安排复习': 'review', '单词记忆': 'memory', '专属练习': 'exercise', '学习答疑': 'question' })[explicit]
  const action = explicitAction ?? intent
  const isLabel = ASSISTANT_CAPABILITIES.some(capability => capability.id === action && capability.request === explicit)
  const requested = isLabel ? '' : explicit
  const lesson = currentLesson?.source === 'today-learning' && currentLesson.wordId && targetFrom(currentLesson.word ?? '') ? currentLesson : null
  if (explicit === 'greeting') return { ...mockAssistantReply(), session: next }
  if (action === 'plan' || action === 'review') {
    next.pending = null
    next.goal = action === 'review' ? 'review' : 'progress'
    const supplied = clarifiedMinutesFrom(planWithTime?.[2] ?? requested)
    if (requested && supplied === null && !['学习计划', '设置学习计划', '是，设置计划', '安排复习'].includes(requested)) return reply('请明确告诉我本次学习多少分钟，或先清空输入再选择学习计划。')
    if (supplied !== null) {
      if (!validMinutes(supplied)) { next.pending = 'time'; return reply(invalidTime(supplied), 'time') }
      next.minutes = supplied
    }
    return plan(action === 'review' ? 'review' : 'progress')
  }
  // Current action supersedes any incomplete older clarification.
  if (action) next.pending = null
  if (!action && next.pending === 'exercise-confirm') {
    if (yes(explicit)) { next.pending = null; return reply(`已确认练习范围：${next.exerciseScope}。专属练习尚未接入模型，当前不会生成题目。`) }
    if (no(explicit)) { next.pending = 'exercise'; return reply('你想练习哪个单词或知识点？请告诉我练习范围。') }
    next.pending = 'exercise'
  }
  if (!action && next.pending === 'time') {
    const minutes = clarifiedMinutesFrom(explicit)
    if (minutes === null) return reply('请明确告诉我本次学习多少分钟（5～60 分钟），或选择滑块并确认。', 'time')
    if (!validMinutes(minutes)) return reply(invalidTime(minutes), 'time')
    next.minutes = minutes
    return plan(next.goal ?? 'progress')
  }
  if (action === 'memory' || !action && next.pending === 'memory') {
    const explicitTarget = targetFrom(requested)
    // Invalid supplied text must not fall through to the lesson target.
    const target = requested ? explicitTarget : selection?.word ? targetFrom(selection.word) : lesson?.word
    if (!target) { next.pending = 'memory'; return reply(requested ? '请明确指定一个单词。你想记住哪个单词呢？' : '你想记住哪个单词呢？') }
    next.pending = null
    return { ...reply(`目标单词：${target}。单词记忆尚未接入模型，当前无法生成记忆方法。`), userText: requested || `帮我记住 ${target}`, target: { ...(requested || selection?.word ? { source: 'explicit', word: target } : lesson) } }
  }
  if (action === 'exercise' || !action && next.pending === 'exercise') {
    const scope = requested || selection?.word || (lesson ? `当前单词 ${lesson.word}` : '')
    if (!scope) { next.pending = 'exercise'; return reply('你想练习哪个单词或知识点？请告诉我练习范围。') }
    next.exerciseScope = scope; next.pending = 'exercise-confirm'
    return { ...reply(`练习范围：${scope}。请确认要围绕这个范围练习吗？专属练习尚未接入模型。`), userText: requested || `围绕${scope}练习`, target: { scope } }
  }
  if (action === 'question' || !action && next.pending === 'question') {
    const question = requested || selection?.text
    if (!question) { next.pending = 'question'; return reply('你遇到了什么问题呢？') }
    next.pending = null
    return { ...reply(`你的问题：${question}\n学习答疑尚未接入模型，当前无法生成答案。`), userText: question, target: { question } }
  }
  const suppliedMinutes = minutesFrom(explicit)
  if (suppliedMinutes !== null) {
    if (!validMinutes(suppliedMinutes)) { next.pending = 'time'; return reply(invalidTime(suppliedMinutes), 'time') }
    next.minutes = suppliedMinutes
    return plan(next.goal ?? 'progress')
  }
  if (yes(explicit)) return plan('progress')
  if (no(explicit)) { next.pending = null; return reply('那么你现在想要做些什么？') }
  if (explicit === '今日任务') return { ...mockAssistantReply(explicit), session: next, userText: explicit }
  return { ...mockAssistantReply(explicit), session: next, userText: explicit }
}
