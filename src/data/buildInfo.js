export function normalizeBuildInfo(value) {
  const info = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const branch = typeof info.branch === 'string' && info.branch.length > 0 &&
    info.branch.length <= 255 && !/[\s\p{Cc}]/u.test(info.branch) ? info.branch : null
  const commit = typeof info.commit === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(info.commit) ? info.commit : null
  const validTime = typeof info.builtAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(info.builtAt) &&
    Number.isFinite(Date.parse(info.builtAt)) && new Date(info.builtAt).toISOString() === info.builtAt

  return {
    branch,
    commit,
    builtAt: validTime ? info.builtAt : null,
    dirty: typeof info.dirty === 'boolean' ? info.dirty : null,
  }
}

export function getBuildInfo() {
  return normalizeBuildInfo(typeof __LINGUAJET_BUILD_INFO__ === 'undefined' ? null : __LINGUAJET_BUILD_INFO__)
}
