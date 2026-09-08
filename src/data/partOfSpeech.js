const labels = {
  n: '名词', v: '动词', vt: '及物动词', vi: '不及物动词', aux: '助动词',
  adj: '形容词', adv: '副词', prep: '介词', pron: '代词', conj: '连词',
  int: '感叹词', art: '冠词', num: '数词',
}
const aliases = { a: 'adj', ad: 'adv', interjection: 'int' }
const englishNames = {
  noun: 'n', verb: 'v', adjective: 'adj', adverb: 'adv', preposition: 'prep',
  pronoun: 'pron', conjunction: 'conj', interjection: 'int', article: 'art', numeral: 'num',
  'transitive verb': 'vt', 'intransitive verb': 'vi', 'auxiliary verb': 'aux',
}

function parts(value = '') {
  return [...new Set((value.replace(/\([^)]*\)|（[^）]*）/g, '').toLowerCase().match(/[a-z]+/g) ?? [])
    .map((part) => aliases[part] ?? part))]
}

export function describePartOfSpeech(value) {
  return parts(value).map((part) => labels[part] ?? part).join(' · ') || '暂无词性'
}

export function matchesWordQuery(item, query) {
  const search = query.trim().toLowerCase()
  const abbreviation = search.replace(/\.$/, '')
  const code = search.endsWith('.') ? aliases[abbreviation] ?? abbreviation : abbreviation
  const category = labels[code] ? code : englishNames[search]
    ?? Object.keys(labels).find((key) => labels[key] === search)
  if (category) {
    const codes = parts(item.partOfSpeech)
    const matchesCategory = category === 'v' ? codes.some((part) => ['v', 'vi', 'vt', 'aux'].includes(part)) : codes.includes(category)
    return matchesCategory || item.word.toLowerCase().includes(search)
  }
  return item.word.toLowerCase().includes(search) || (item.meaning ?? '').toLowerCase().includes(search)
}
