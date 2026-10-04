import { useState } from 'react'
import { AssistantProvider, useAssistant } from '../data/assistant/react'
import './LocalBackendCheckPanel.css'

export default function LocalBackendCheckPanel(props) {
  const assistant = useAssistant()
  if (!assistant) return <AssistantProvider><ConnectedPanel {...props} /></AssistantProvider>
  return <ConnectedPanel {...props} />
}
function ConnectedPanel({ project = 'all', expanded = false }) {
  const assistant = useAssistant()
  const [code, setCode] = useState('')
  const connect = async () => { if (await assistant.connect(code)) setCode('') }
  const connection = project === 'connect' || project === 'all'
  const real = project === 'real' || project === 'all'
  const illegal = project === 'illegal' || project === 'all'
  const projectError = project === 'all' ? assistant.clientState.error : assistant.projectErrors?.[project]
  const body = <div className="local-backend-panel__body">
      <p>固定地址：<code>http://127.0.0.1:5280</code></p>
      <p>只发送学习计数、设置和状态摘要；任务、逐次反馈与具体错题留在浏览器。检查只读，不调整计划。连接凭证仅保留在当前页面，刷新后需重新配对。</p>
      {connection && <p>先启动服务并粘贴一次性连接码。点击连接后，Edge 可能要求允许本站本地网络访问。站点权限、来源检查与会话认证分别验证。</p>}
      {real && <p>将此刻的学习摘要交给本机服务校验格式；通过后，后续记录变化会使这次结论失效。</p>}
      {illegal && <p>固定非法示例独立检查输入拒绝行为，不使用你的学习明细。</p>}
      {connection && <label>一次性连接码<input aria-label="一次性连接码" type="password" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" spellCheck={false} /></label>}
      <div className="local-backend-panel__actions">
        {connection && <button type="button" onClick={connect} disabled={assistant.busy || !code.trim()}>连接本机后端</button>}
        {real && <button type="button" onClick={() => assistant.check()} disabled={!assistant.connected || assistant.busy}>检查当前学习摘要</button>}
        {illegal && <button type="button" onClick={() => assistant.check(true)} disabled={!assistant.connected || assistant.busy}>检查非法示例</button>}
        {assistant.busy && assistant.cancel && <button type="button" onClick={assistant.cancel}>取消等待</button>}
        {(assistant.connected || assistant.busy) && <button type="button" onClick={assistant.disconnect}>断开连接</button>}
      </div>
      {illegal && assistant.connected && <p>非法示例发送固定的测试数据，预期返回 422；与当前学习摘要分开。</p>}
      <p aria-live="polite" className="local-backend-panel__status">{project === 'all' ? assistant.message
        : project === 'connect' ? assistant.connectionMessage
          : project === 'real' ? assistant.summaryStatus === 'not-checked' ? '尚未检查当前学习摘要。' : assistant.message
            : assistant.illegalMessage ?? '尚未执行固定非法示例检查。'}</p>
      {real && assistant.checkedAt && <p>本次检查时间：{assistant.checkedAt}</p>}
      {project === 'all' && assistant.illegalMessage && <div aria-label="固定非法示例检查结果"><p>固定非法示例</p><p aria-live="polite">{assistant.illegalMessage}</p></div>}
      {projectError?.restartRequired && <p>请重新启动本机服务，使用新的连接码配对。</p>}
      {projectError?.retryAfter && <p>请等待 {projectError.retryAfter} 秒后再手动尝试。</p>}
    </div>
  return expanded ? <section className="local-backend-panel" aria-label="当前检查项目">{body}</section>
    : <details className="local-backend-panel"><summary>开发验收：本机后端</summary>{body}</details>
}
