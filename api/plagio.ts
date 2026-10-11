import {
  AiFailure,
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
import { fetchPage, matchPages, pickForSearch, sentencesOf, type Page } from './_web.js'

const MAX_REFS = 40
const MAX_ABSTRACT = 1500
const MAX_CITED_PASSAGES = 12

const SEARCHED_SENTENCES = 10
const MAX_PAGES = 20
const MAX_WEB_PASSAGES = 15

const DOI = /\b10\.\d{4,9}\/[^\s,;]+/i

const SYSTEM =
  'Você é um revisor experiente de integridade científica em textos acadêmicos da área da saúde, rigoroso e construtivo.'

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
  const searched = pickForSearch(sentences, SEARCHED_SENTENCES)
  if (searched.length === 0) return { status: 'indisponivel' as const }

  let sources: WebSource[]
  try {
    ;({ sources } = await searchWeb(
      SYSTEM,
      `Quero saber se as frases abaixo já existem publicadas na internet (artigos, teses, dissertações, sites, apostilas). Faça uma busca no Google para cada frase, usando entre aspas um trecho característico de 8 a 12 palavras dela. Depois de pesquisar todas, responda apenas "ok".

${searched.map((s, i) => `${i + 1}. ${s.text}`).join('\n')}`,
    ))
  } catch (error) {
    if (error instanceof AiFailure && error.status === 429) return { status: 'sem_cota' as const }
    throw error
  }
  const unique = [...new Map(sources.map((s) => [s.url, s])).values()].slice(0, MAX_PAGES)
  const pages = (await Promise.all(unique.map(fetchPage))).filter((p): p is Page => p !== null)
  const matches = matchPages(sentences, pages)
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
