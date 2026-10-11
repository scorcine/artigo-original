import type { WebSource } from './_ia.js'
import { countWords } from './_projeto.js'

const PAGE_TIMEOUT_MS = 10000
const MAX_PAGE_CHARS = 2_000_000
const SHINGLE = 5
const MIN_SENTENCE_WORDS = 10
const MAX_SEARCH_WORDS = 50
/** Fração das sequências de 5 palavras da frase que precisa aparecer na página para contar como cópia. */
const MATCH_RATIO = 0.5

export interface Sentence {
  campo: string
  text: string
  shingles: string[]
}

export interface Page {
  url: string
  title: string
  shingles: Set<string>
}

export interface WebMatch {
  campo: string
  trecho: string
  url: string
  titulo: string
  semelhanca: number
}

const plain = (s: string) =>
  s
    .replace(/\[COMPLETAR[^\]]*\]/gi, ' ')
    .replace(/\(\d+(?:\s*[,–-]\s*\d+)*\)/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

function shingles(text: string): string[] {
  const t = plain(text).split(' ').filter(Boolean)
  const out: string[] = []
  for (let i = 0; i + SHINGLE <= t.length; i++) out.push(t.slice(i, i + SHINGLE).join(' '))
  return out
}

export function sentencesOf(parts: Map<string, string>): Sentence[] {
  const out: Sentence[] = []
  for (const [campo, text] of parts) {
    for (const line of text.split(/\r?\n/)) {
      for (const raw of line.split(/(?<=[.!?;])\s+/)) {
        const sentence = raw.trim()
        if (countWords(plain(sentence)) >= MIN_SENTENCE_WORDS) out.push({ campo, text: sentence, shingles: shingles(sentence) })
      }
    }
  }
  return out
}

/** As frases mais longas de cada campo, alternando entre os campos. */
export function pickForSearch(sentences: Sentence[], max: number): Sentence[] {
  const byField = new Map<string, Sentence[]>()
  for (const s of sentences) {
    if (countWords(s.text) > MAX_SEARCH_WORDS) continue
    byField.set(s.campo, [...(byField.get(s.campo) ?? []), s])
  }
  const queues = [...byField.values()].map((list) => [...list].sort((a, b) => b.shingles.length - a.shingles.length))
  const picked: Sentence[] = []
  while (picked.length < max && queues.some((q) => q.length)) {
    for (const q of queues) {
      const next = q.shift()
      if (next && picked.length < max) picked.push(next)
    }
  }
  return picked
}

const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z])(acute|grave|circ|tilde|cedil|uml);/gi, '$1')

export async function fetchPage(source: WebSource): Promise<Page | null> {
  try {
    const response = await fetch(source.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      headers: { 'User-Agent': 'Mozilla/5.0 (verificacao de similaridade academica)', Accept: 'text/html,text/plain' },
    })
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok || !/text\/(html|plain)|xhtml/.test(type)) return null
    const html = (await response.text()).slice(0, MAX_PAGE_CHARS)
    const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').trim()
    const text = decodeEntities(html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '))
    return { url: response.url || source.url, title: title || source.title, shingles: new Set(shingles(text)) }
  } catch {
    return null
  }
}

/** Frases do texto que aparecem (iguais ou quase iguais) nas páginas, com a página mais parecida. */
export function matchPages(sentences: Sentence[], pages: Page[]): WebMatch[] {
  const matches: WebMatch[] = []
  for (const s of sentences) {
    if (s.shingles.length === 0) continue
    let best: { page: Page; ratio: number } | null = null
    for (const page of pages) {
      const ratio = s.shingles.filter((sh) => page.shingles.has(sh)).length / s.shingles.length
      if (ratio >= MATCH_RATIO && (!best || ratio > best.ratio)) best = { page, ratio }
    }
    if (best) {
      matches.push({
        campo: s.campo,
        trecho: s.text,
        url: best.page.url,
        titulo: best.page.title,
        semelhanca: Math.round(best.ratio * 100),
      })
    }
  }
  return matches
}
