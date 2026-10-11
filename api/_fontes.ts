import { generate } from './_ia.js'
import { fetchSources, searchIds, type Source } from './_pubmed.js'

export type { Source }

/** Marcadores de citação usados pela IA: [S1], [S1,S4], [S2-S5]. */
export const CITATION = /\[S\d+(?:\s*[,;–-]\s*S?\d+)*\]/g

export function citedIds(marker: string): number[] {
  const ids: number[] = []
  for (const part of marker.slice(1, -1).split(/\s*[,;]\s*/)) {
    const range = part.match(/S?(\d+)\s*[–-]\s*S?(\d+)/)
    if (range) {
      for (let n = Number(range[1]); n <= Number(range[2]) && n - Number(range[1]) < 20; n++) ids.push(n)
    } else {
      const single = part.match(/S?(\d+)/)
      if (single) ids.push(Number(single[1]))
    }
  }
  return ids
}

export function parseJson<T>(answer: string): T | null {
  const json = answer.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return null
  try {
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

const sameSource = (source: Source, line: string) =>
  Boolean(source.doi && line.toLowerCase().includes(source.doi.toLowerCase())) ||
  normalize(line).includes(normalize(source.title).slice(0, 60))

export const alreadyListed = (source: Source, existingRefs: string[]) => existingRefs.some((line) => sameSource(source, line))

interface SearchOptions {
  /** O que as buscas devem priorizar, além do tema do estudo. */
  focus: string
  maxSources: number
  minSources: number
  resultsPerQuery: number
  recentYears: number
  /** Limite de caracteres por resumo; os resultados ficam no fim do resumo. */
  maxAbstract?: number
}

/** A IA monta as buscas em inglês e o PubMed devolve artigos reais, priorizando os mais recentes. */
export async function findSources(context: string, options: SearchOptions): Promise<Source[]> {
  const answer = await generate(
    'titulos',
    'Você é bibliotecário especialista em buscas no PubMed para pesquisas da área da saúde.',
    `Com base no estudo abaixo, escreva 3 estratégias de busca para o PubMed, em inglês, usando termos MeSH e sinônimos com AND/OR.
${options.focus}
Não use filtros de data, idioma ou tipo de publicação.

Estudo:
"""
${context}
"""

Responda apenas com um JSON: {"buscas": ["...", "...", "..."]}`,
  )
  const queries = (parseJson<{ buscas?: unknown }>(answer)?.buscas ?? []) as unknown[]
  const valid = queries.filter((q): q is string => typeof q === 'string' && q.trim() !== '').slice(0, 3)
  if (valid.length === 0) return []

  const ids: string[] = []
  const thisYear = new Date().getFullYear()
  for (const minYear of [thisYear - options.recentYears, thisYear - 2 * options.recentYears]) {
    for (const query of valid) {
      if (ids.length >= options.maxSources) break
      for (const id of await searchIds(query, minYear, options.resultsPerQuery)) {
        if (!ids.includes(id) && ids.length < options.maxSources) ids.push(id)
      }
    }
    if (ids.length >= options.minSources) break
  }
  return fetchSources(ids, options.maxAbstract)
}

export const sourceList = (sources: Source[]) =>
  sources.map((s, i) => `[S${i + 1}] ${s.title} (${s.year})\nResumo: ${s.abstract}`).join('\n\n')

/** Troca [S#] por números no estilo Vancouver, reaproveitando referências que já estão na lista do pesquisador. */
export function numberCitations(text: string, sources: Source[], existingRefs: string[]) {
  const existing = existingRefs.map((line) => ({ line, number: Number(line.match(/^\s*(\d+)/)?.[1] ?? NaN) }))
  let next = Math.max(0, ...existing.map((e) => (Number.isNaN(e.number) ? 0 : e.number))) + 1
  const numberOf = new Map<number, number>()
  const newRefs: string[] = []

  const assign = (id: number): number | null => {
    const source = sources[id - 1]
    if (!source) return null
    const known = numberOf.get(id)
    if (known) return known
    const match = existing.find((e) => !Number.isNaN(e.number) && sameSource(source, e.line))
    const number = match ? match.number : next++
    if (!match) newRefs.push(`${number}. ${source.reference}`)
    numberOf.set(id, number)
    return number
  }

  const formatted = text.replace(CITATION, (marker) => {
    const numbers = [...new Set(citedIds(marker).map(assign).filter((n): n is number => n !== null))].sort((a, b) => a - b)
    if (numbers.length === 0) return ''
    const groups: string[] = []
    for (let i = 0; i < numbers.length; i++) {
      let j = i
      while (j + 1 < numbers.length && numbers[j + 1] === numbers[j] + 1) j++
      groups.push(j - i >= 2 ? `${numbers[i]}-${numbers[j]}` : numbers.slice(i, j + 1).join(','))
      i = j
    }
    return `(${groups.join(',')})`
  })

  return { text: formatted.replace(/ +([.,;])/g, '$1'), newRefs }
}
