const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
const TIMEOUT_MS = 15000
const MAX_ABSTRACT = 1000

export interface Source {
  pmid: string
  title: string
  abstract: string
  year: string
  doi: string
  reference: string
}

interface Summary {
  title?: string
  authors?: { name: string; authtype?: string }[]
  source?: string
  pubdate?: string
  volume?: string
  issue?: string
  pages?: string
  articleids?: { idtype: string; value: string }[]
}

const params = (extra: Record<string, string>) => new URLSearchParams({ db: 'pubmed', tool: 'artigo-original', ...extra })

/** Sem chave própria, o PubMed aceita no máximo 3 pedidos por segundo. */
const MIN_INTERVAL_MS = 400
const RETRY_DELAYS_MS = [1000, 2500, 5000]
let lastRequest = 0

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function get(url: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequest + MIN_INTERVAL_MS - Date.now()
    lastRequest = Math.max(Date.now(), lastRequest + MIN_INTERVAL_MS)
    if (wait > 0) await sleep(wait)
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (response.ok) return response
    if ((response.status === 429 || response.status >= 500) && attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt])
      continue
    }
    throw new Error(`PubMed respondeu ${response.status}`)
  }
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

export async function searchIds(query: string, minYear: number, max: number): Promise<string[]> {
  const url = `${EUTILS}/esearch.fcgi?${params({
    term: `(${query}) AND hasabstract AND (english[lang] OR portuguese[lang] OR spanish[lang])`,
    retmode: 'json',
    retmax: String(max),
    sort: 'relevance',
    datetype: 'pdat',
    mindate: String(minYear),
    maxdate: '3000',
  })}`
  const data = (await (await get(url)).json()) as { esearchresult?: { idlist?: string[] } }
  return data.esearchresult?.idlist ?? []
}

function vancouver(s: Summary): string {
  const names = (s.authors ?? []).filter((a) => !a.authtype || a.authtype === 'Author').map((a) => a.name)
  const authors = names.length > 6 ? `${names.slice(0, 6).join(', ')}, et al` : names.join(', ')
  const title = decode(s.title ?? '').replace(/\.$/, '')
  let ref = `${authors ? `${authors}. ` : ''}${title}. ${s.source ?? ''}. ${(s.pubdate ?? '').slice(0, 4)}`
  if (s.volume) ref += `;${s.volume}`
  if (s.issue) ref += `(${s.issue})`
  if (s.pages) ref += `:${s.pages}`
  ref += '.'
  const doi = s.articleids?.find((a) => a.idtype === 'doi')?.value
  return doi ? `${ref} doi:${doi}` : ref
}

export async function fetchSources(ids: string[]): Promise<Source[]> {
  if (ids.length === 0) return []
  const idList = ids.join(',')
  const summaryResponse = await get(`${EUTILS}/esummary.fcgi?${params({ id: idList, retmode: 'json' })}`)
  const summaries = ((await summaryResponse.json()) as { result?: Record<string, Summary> }).result ?? {}
  const abstractResponse = await get(`${EUTILS}/efetch.fcgi?${params({ id: idList, retmode: 'xml', rettype: 'abstract' })}`)
  const xml = await abstractResponse.text()

  const abstracts = new Map<string, string>()
  for (const article of xml.split('<PubmedArticle>').slice(1)) {
    const pmid = article.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1]
    const parts = [...article.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)].map(([, attrs, text]) => {
      const label = attrs.match(/Label="([^"]+)"/)?.[1]
      return label ? `${label}: ${decode(text)}` : decode(text)
    })
    if (pmid && parts.length) abstracts.set(pmid, parts.join(' ').slice(0, MAX_ABSTRACT))
  }

  return ids
    .map((pmid) => {
      const s = summaries[pmid]
      const abstract = abstracts.get(pmid)
      if (!s?.title || !abstract) return null
      return {
        pmid,
        title: decode(s.title),
        abstract,
        year: (s.pubdate ?? '').slice(0, 4),
        doi: s.articleids?.find((a) => a.idtype === 'doi')?.value ?? '',
        reference: vancouver(s),
      }
    })
    .filter((s): s is Source => s !== null)
}
