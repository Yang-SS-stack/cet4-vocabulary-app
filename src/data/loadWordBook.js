import { createInlineWordBookSession, createRemoteWordBookSession, isValidWordBookManifest } from './wordBookSession'

const sessions = new Map()

export function clearWordBookCache() {
  sessions.clear()
}

export async function loadWordBook(book, fetchImpl = fetch) {
  if (Array.isArray(book.words)) return createInlineWordBookSession(book.words)

  if (!sessions.has(book.dataUrl)) {
    const sessionPromise = (async () => {
      let response
      try {
        response = await fetchImpl(book.dataUrl)
      } catch {
        throw new Error('Unable to load word book manifest')
      }
      if (!response?.ok) throw new Error('Unable to load word book manifest')
      let manifest
      try {
        manifest = await response.json()
      } catch {
        throw new Error('Unable to load word book manifest')
      }
      if (!isValidWordBookManifest(manifest)) throw new Error('Unable to load word book manifest')
      return createRemoteWordBookSession(manifest, book.dataUrl, fetchImpl)
    })().catch((error) => {
      sessions.delete(book.dataUrl)
      throw error
    })
    sessions.set(book.dataUrl, sessionPromise)
  }

  return sessions.get(book.dataUrl)
}
