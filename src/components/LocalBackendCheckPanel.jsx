import { useState } from 'react'
import { AssistantProvider, useAssistant } from '../data/assistant/react'
import './LocalBackendCheckPanel.css'

export default function LocalBackendCheckPanel() {
  const assistant = useAssistant()
  if (!assistant) return <AssistantProvider><ConnectedPanel /></AssistantProvider>
  return <ConnectedPanel />
}
function ConnectedPanel() {
  const assistant = useAssistant()
  const [code, setCode] = useState('')
  const connect = async () => { if (await assistant.connect(code)) setCode('') }
  return <details className="local-backend-panel">
    <summary>开发验收：本机后端</summary>
    <div className="local-backend-panel__body">
      <p>固定地址：<code>http://127.0.0.1:5280</code></p>
      <p>只发送学习计数、设置和状态摘要；任务、逐次反馈与具体错题留在浏览器。检查只读，不调整计划。连接凭证仅保留在当前页面，刷新后需重新配对。</p>
      <p>先启动服务并粘贴一次性连接码。点击连接后，Edge 可能要求允许本站本地网络访问。站点权限、来源检查与会话认证分别验证。</p>
      <label>一次性连接码<input aria-label="一次性连接码" type="password" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" spellCheck={false} /></label>
      <div className="local-backend-panel__actions">
        <button type="button" onClick={connect} disabled={assistant.busy || !code.trim()}>连接本机后端</button>
        <button type="button" onClick={() => assistant.check()} disabled={!assistant.connected || assistant.busy}>检查当前学习摘要</button>
        {assistant.connected && <button type="button" onClick={() => assistant.check(true)} disabled={assistant.busy}>检查非法示例</button>}
        {(assistant.connected || assistant.busy) && <button type="button" onClick={assistant.disconnect}>断开连接</button>}
      </div>
      {assistant.connected && <p>非法示例发送固定的测试数据，预期返回 422；与当前学习摘要分开。</p>}
      <p aria-live="polite" className="local-backend-panel__status">{assistant.message}</p>
      {assistant.checkedAt && <p>本次检查时间：{assistant.checkedAt}</p>}
      {assistant.illegalMessage && <div aria-label="固定非法示例检查结果"><p>固定非法示例</p><p aria-live="polite">{assistant.illegalMessage}</p></div>}
      {assistant.clientState.error?.restartRequired && <p>请重新启动本机服务，使用新的连接码配对。</p>}
      {assistant.clientState.error?.retryAfter && <p>请等待 {assistant.clientState.error.retryAfter} 秒后再手动尝试。</p>}
    </div>
  </details>
}
