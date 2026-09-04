import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const [sourcePath, outputPathArg, limitArg] = process.argv.slice(2)
if (!sourcePath) {
  throw new Error('Usage: node scripts/build-cet4-high-frequency.mjs <frequency.json> [output.json] [limit]')
}

const outputPath = outputPathArg
  ?? resolve(projectRoot, 'public/data/cet4-high-frequency.json')
const limit = Number(limitArg ?? 2000)

const [cet4Data, frequencyData] = await Promise.all([
  readFile(resolve(projectRoot, 'public/data/cet4.json'), 'utf8').then(JSON.parse),
  readFile(sourcePath, 'utf8').then(JSON.parse),
])

const cet4ByWord = new Map(cet4Data.map((entry) => [entry.word.trim().toLowerCase(), entry]))
const rows = frequencyData['四六级词汇词频排序表'] ?? frequencyData
if (!Array.isArray(rows)) throw new Error('词频数据必须是数组')

const matched = rows
  .map((row, sourceIndex) => ({
    word: String(row['单词'] ?? row.word ?? '').trim().toLowerCase(),
    frequency: Number(row['词频'] ?? row.frequency),
    sourceIndex,
  }))
  .filter((row) => row.word && Number.isInteger(row.frequency) && row.frequency > 0 && cet4ByWord.has(row.word))
  .sort((a, b) => b.frequency - a.frequency || a.sourceIndex - b.sourceIndex)

const selected = matched.slice(0, limit).map(({ word, frequency }) => ({
  ...cet4ByWord.get(word),
  frequency,
}))

if (selected.length !== limit) {
  throw new Error(`词频数据与 CET-4 词库交集仅有 ${selected.length} 条，无法生成 ${limit} 条高频词`)
}

await writeFile(outputPath, `${JSON.stringify(selected, null, 2)}\n`, 'utf8')
console.log(`已生成 ${selected.length} 条高频词：${outputPath}`)
console.log(`词频范围：${selected[0].frequency} - ${selected.at(-1).frequency}`)
