import {
  canSearchWeb,
  errorResponse,
  failureResponse,
  generate,
  hasKey,
  isRateLimited,
  NO_KEY_MESSAGE,
  searchWeb,
  type WebSource,
} from './_ia.js'
import { parseJson } from './_fontes.js'
import { countWords, findings, level, readProject, str, type Project, type ProjectBody } from './_projeto.js'
import { fetchSources, idsForDois, type Source } from './_pubmed.js'

const MAX_REFS = 40
const MAX_ABSTRACT = 1500
const MAX_CITED_PASSAGES = 12

const SEARCHED_SENTENCES = 10
const MAX_PAGES = 20
const PAGE_TIMEOUT_MS = 10000
const MAX_PAGE_CHARS = 2_000_000
const SHINGLE = 5
const MIN_SENTENCE_WORDS = 10
const MAX_SEARCH_WORDS = 50
/** Fração das sequências de 5 palavras da frase que precisa aparecer na página para contar como cópia. */
const MATCH_RATIO = 0.5
const MAX_WEB_PASSAGES = 15

const DOI = /\b10\.\d{4,9}\/[^\s,;]+/i

const SYSTEM =
  'Você é um revisor experiente de integridade científica em textos acadêmicos da área da saúde, rigoroso e construtivo.'

interface Sentence {
  campo: string
  text: string
  shingles: string[]
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

function sentencesOf(parts: Map<string, string>): Sentence[] {
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
function pickForSearch(sentences: Sentence[]): Sentence[] {
  const byField = new Map<string, Sentence[]>()
  for (const s of sentences) {
    if (countWords(s.text) > MAX_SEARCH_WORDS) continue
    byField.set(s.campo, [...(byField.get(s.campo) ?? []), s])
  }
  const queues = [...byField.values()].map((list) => [...list].sort((a, b) => b.shingles.length - a.shingles.length))
  const picked: Sentence[] = []
  while (picked.length < SEARCHED_SENTENCES && queues.some((q) => q.length)) {
    for (const q of queues) {
      const next = q.shift()
      if (next && picked.length < SEARCHED_SENTENCES) picked.push(next)
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

interface Page {
  url: string
  title: string
  shingles: Set<string>
}

async function fetchPage(source: WebSource): Promise<Page | null> {
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
    const text = decodeEntities(
      html
        .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' '),
    )
    return { url: response.url || source.url, title: title || source.title, shingles: new Set(shingles(text)) }
  } catch {
    return null
  }
}

async function rewrite(passages: { trecho: string }[]): Promise<string[]> {
  if (passages.length === 0) return []
  const answer = await generate(
    'revisao',
    SYSTEM,
    `Os trechos abaixo foram encontrados publicados na internet. Reescreva cada um com palavras e estrutura próprias, em português científico, mantendo o sentido, os dados e as citações numéricas (como "(3)").

${passages.map((p, i) => `${i + 1}. ${p.trecho}`).join('\n')}

Responda apenas com um JSON: {"reescritas": [{"n": 1, "texto": "..."}]}`,
  )
  const parsed = parseJson<{ reescritas?: { n?: unknown; texto?: unknown }[] }>(answer)
  const out: string[] = passages.map(() => '')
  for (const r of parsed?.reescritas ?? []) {
    const n = Number(r?.n)
    if (Number.isInteger(n) && n >= 1 && n <= passages.length) out[n - 1] = str(r.texto, 2500)
  }
  return out
}

async function checkInternet(project: Project, totalWords: number) {
  if (!canSearchWeb()) return { status: 'indisponivel' as const }
  const sentences = sentencesOf(project.parts)
  const searched = pickForSearch(sentences)
  if (searched.length === 0) return { status: 'indisponivel' as const }

  const { sources } = await searchWeb(
    SYSTEM,
    `Quero saber se as frases abaixo já existem publicadas na internet (artigos, teses, dissertações, sites, apostilas). Faça uma busca no Google para cada frase, usando entre aspas um trecho característico de 8 a 12 palavras dela. Depois de pesquisar todas, responda apenas "ok".

${searched.map((s, i) => `${i + 1}. ${s.text}`).join('\n')}`,
  )
  const unique = [...new Map(sources.map((s) => [s.url, s])).values()].slice(0, MAX_PAGES)
  const pages = (await Promise.all(unique.map(fetchPage))).filter((p): p is Page => p !== null)

  const matches: { campo: string; trecho: string; url: string; titulo: string; semelhanca: number }[] = []
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
  const shown = matches.slice(0, MAX_WEB_PASSAGES)
  const rewritten = await rewrite(shown).catch(() => shown.map(() => ''))
  const percent = totalWords
    ? Math.round((matches.reduce((sum, m) => sum + countWords(m.trecho), 0) / totalWords) * 1000) / 10
    : 0

  return {
    status: 'ok' as const,
    frasesPesquisadas: searched.length,
    paginasVerificadas: pages.length,
    percentual: percent,
    nivel: level(percent),
    trechos: shown.map((m, i) => ({ ...m, sugestao: rewritten[i] })),
  }
}

async function checkCited(project: Project, references: string[], totalWords: number) {
  const dois = [
    ...new Set(
      references
        .slice(0, MAX_REFS)
        .map((r) => (typeof r === 'string' ? DOI.exec(r)?.[0].replace(/[.)\]]+$/, '') : undefined))
        .filter((d): d is string => !!d),
    ),
  ]
  const sources: Source[] = await idsForDois(dois)
    .then((ids) => fetchSources(ids, MAX_ABSTRACT))
    .catch(() => [])
  if (sources.length === 0) return { status: 'indisponivel' as const, referencias: references.length }

  const list = sources.map((s, i) => `[S${i + 1}] ${s.reference}\nResumo: ${s.abstract}`).join('\n\n')
  const answer = await generate(
    'revisao',
    SYSTEM,
    `Verifique se o texto abaixo reproduz trechos dos artigos citados, inclusive por tradução. Compare cada campo com os resumos das fontes.

Texto (cada campo marcado com <<campo id="..." titulo="...">>):
${project.document}

Fontes citadas (resumos do PubMed):
${list}

Aponte somente trechos (de até 60 palavras) que sejam:
- "cópia": texto idêntico ao da fonte;
- "tradução literal": a mesma frase da fonte traduzida palavra por palavra;
- "paráfrase muito próxima": mesma estrutura e sequência de ideias da fonte, só com troca de palavras.
Não aponte fatos comuns da área, definições curtas, nomes de escalas ou dados numéricos citados corretamente com a referência.
Para cada trecho: "campo" (id), "trecho" (cópia exata, caractere por caractere, do texto do pesquisador), "fonte" (ex.: "S3"), "tipo" e "sugestao" (reescrita com palavras e estrutura próprias, mantendo o sentido e as citações). No máximo ${MAX_CITED_PASSAGES} trechos; se não houver nenhum, devolva a lista vazia.

Responda apenas com um JSON:
{"trechos": [{"campo": "...", "trecho": "...", "fonte": "S1", "tipo": "...", "sugestao": "..."}]}`,
  )
  const parsed = parseJson<{ trechos?: unknown }>(answer)
  const items = findings(parsed?.trechos, project.parts, ['fonte', 'tipo']).slice(0, MAX_CITED_PASSAGES)
  const percent = totalWords
    ? Math.round((items.reduce((sum, t) => sum + countWords(t.trecho), 0) / totalWords) * 1000) / 10
    : 0
  return {
    status: 'ok' as const,
    fontesComparadas: sources.length,
    referencias: references.length,
    percentual: percent,
    nivel: level(percent),
    trechos: items.map((t) => ({ ...t, fonte: sources[Number(/\d+/.exec(t.fonte)?.[0]) - 1]?.reference ?? '' })),
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!hasKey()) return errorResponse(NO_KEY_MESSAGE, 503)
  if (isRateLimited(request, 10)) return errorResponse('Muitos pedidos seguidos. Tente de novo daqui a pouco.', 429)

  let body: ProjectBody
  try {
    body = (await request.json()) as ProjectBody
  } catch {
    return errorResponse('Pedido inválido.', 400)
  }
  const project = readProject(body)
  if (project.parts.size === 0) return errorResponse('Preencha o texto antes de pedir a verificação.', 400)
  const totalWords = [...project.parts.values()].reduce((sum, t) => sum + countWords(t), 0)
  const references = Array.isArray(body.referencias) ? body.referencias.filter((r) => typeof r === 'string') : []

  const started = Date.now()
  const [internet, cited] = await Promise.allSettled([
    checkInternet(project, totalWords),
    checkCited(project, references, totalWords),
  ])
  if (internet.status === 'rejected' && cited.status === 'rejected') return failureResponse(internet.reason)
  if (internet.status === 'rejected') console.error('plagio: internet falhou', internet.reason)
  if (cited.status === 'rejected') console.error('plagio: citadas falhou', cited.reason)

  const web = internet.status === 'fulfilled' ? internet.value : { status: 'erro' as const }
  console.log(
    `plagio: ${project.parts.size} campos, internet ${web.status}${'paginasVerificadas' in web ? ` (${web.paginasVerificadas} páginas)` : ''}, ${Date.now() - started} ms`,
  )
  return Response.json({
    internet: web,
    citadas: cited.status === 'fulfilled' ? cited.value : { status: 'erro', referencias: references.length },
  })
}
