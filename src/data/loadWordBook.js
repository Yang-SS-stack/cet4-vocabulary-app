export async function loadWordBook(book, fetchImpl = fetch) {
  if (Array.isArray(book.words)) return book.words

  const response = await fetchImpl(book.dataUrl)
  if (!response.ok) throw new Error('Unable to load word book')

  const words = await response.json()
  if (!Array.isArray(words)) throw new Error('Word book data must be an array')

  return words
}
