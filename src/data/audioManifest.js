let manifestPromise

export function resolveAudioPath(path, baseUrl = import.meta.env.BASE_URL) {
  if (!path) return path
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${normalizedBaseUrl}${path.replace(/^\/+/, '')}`
}

function resolveManifest(manifest) {
  return {
    ...manifest,
    words: Object.fromEntries(Object.entries(manifest.words ?? {}).map(([word, files]) => [
      word,
      Object.fromEntries(Object.entries(files ?? {}).map(([type, path]) => [
        type,
        resolveAudioPath(path),
      ])),
    ])),
  }
}

export function loadAudioManifest() {
  if (!manifestPromise) {
    manifestPromise = import('./audioManifest.json')
      .then(({ default: manifest }) => resolveManifest(manifest))
      .catch((error) => {
        manifestPromise = null
        throw error
      })
  }
  return manifestPromise
}
