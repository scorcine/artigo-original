import { clip, errorResponse, failureResponse, generate, hasKey, isRateLimited, NO_KEY_MESSAGE } from './_ia.js'
import { parseJson } from './_fontes.js'
import { fetchSources, idsForDois, type Source } from './_pubmed.js'

interface Part {
  id?: string
  titulo?: string
  texto?: string
}

interface Body {
  fase?: number
  studyType?: string
  guideline?: string
  partes?: Part[]
  referencias?: string[]
}

interface Finding {
  campo: string
  trecho: string
  sugestao: string
}

const MAX_PARTS = 60
const MAX_PART = 8000
const MAX_TOTAL = 70000
const MAX_REFS = 40
const MAX_ABSTRACT = 1500
const MAX_CORRECTIONS = 15
const MAX_SIMILAR = 12

const CRITERIA = [
  'Clareza e objetividade',
  'Gramática e ortografia',
  'Linguagem científica',
  'Organização e coesão',
  'Coerência entre as partes',
  'Adequação às exigências',
]

const DOI = /\b10\.\d{4,9}\/[^\s,;]+/i

const SYSTEM =
  'Você é um revisor experiente de projetos de pesquisa (sistema CEP/CONEP) e de artigos originais da área da saúde, rigoroso e construtivo.'

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
const words = (s: string) => s.split(/\s+/).filter(Boolean).length
const str = (v: unknown, max: number) => (typeof v === 'string' ? clip(v.trim(), max) : '')

function findings(raw: unknown, parts: Map<string, string>, extra: string[]): (Finding & Record<string, string>)[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const r = (item ?? {}) as Record<string, unknown>
      const out: Record<string, string> = {
        campo: str(r.campo, 80),
        trecho: str(r.trecho, 1500),
        sugestao: str(r.sugestao, 2500),
      }
      for (const key of extra) out[key] = str(r[key], 600)
      return out as Finding & Record<string, string>
    })
    .filter((f) => f.trecho && f.sugestao && normalize(parts.get(f.campo) ?? '').includes(normalize(f.trecho)))
}

export async function POST(request: Request): Promise<Response> {
  if (!hasKey()) return errorResponse(NO_KEY_MESSAGE, 503)
  if (isRateLimited(request, 10)) return errorResponse('Muitos pedidos seguidos. Tente de novo daqui a pouco.', 429)

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return errorResponse('Pedido inválido.', 400)
  }

  const parts = new Map<string, string>()
  const titles = new Map<string, string>()
  let total = 0
  for (const p of (body.partes ?? []).slice(0, MAX_PARTS)) {
    const id = str(p.id, 80)
    const text = str(p.texto, MAX_PART)
    if (!id || !text || total + text.length > MAX_TOTAL) continue
    parts.set(id, text)
    titles.set(id, str(p.titulo, 200) || id)
    total += text.length
  }
  if (parts.size === 0) return errorResponse('Preencha o projeto antes de pedir a análise.', 400)

  const project = body.fase === 1
  const document = [...parts]
    .map(([id, text]) => `<<campo id="${id}" titulo="${titles.get(id)}">>\n${text}`)
    .join('\n\n')
  const requirements = project
    ? 'exigências do sistema CEP/CONEP (Resolução CNS 466/2012): riscos e formas de minimizá-los, benefícios, consentimento, coleta só após aprovação, TCLE em linguagem acessível ao participante'
    : `itens da diretriz de relato${body.guideline ? ` ${clip(body.guideline, 200)}` : ''} para um artigo original`

  const quality = async () => {
    const answer = await generate(
      'revisao',
      SYSTEM,
      `Analise a qualidade do texto deste ${project ? 'projeto de pesquisa para o CEP' : 'artigo original'}${body.studyType ? ` (${clip(body.studyType, 200)})` : ''}. Cada campo está marcado com <<campo id="..." titulo="...">>.

${document}

Avalie de 0 a 10 cada critério, com um comentário curto e específico:
${CRITERIA.map((c) => `- ${c}`).join('\n')}
"Coerência entre as partes": objetivo, desenho, população, desfechos, tamanho da amostra e análise estatística combinam entre si?
"Adequação às exigências": ${requirements}.

Depois liste até ${MAX_CORRECTIONS} correções, das mais importantes para as menos importantes (erros de português, frases confusas, termos imprecisos, incoerências, informações que faltam). Para cada uma:
- "campo": o id do campo;
- "trecho": cópia exata, caractere por caractere, de um trecho curto do campo (até 40 palavras) a ser substituído;
- "problema": o que está errado, em uma frase;
- "sugestao": o texto que deve substituir o trecho, pronto para uso, sem inventar dados (use [COMPLETAR: ...] se faltar uma informação concreta).
Liste também até 3 pontos fortes.

Responda apenas com um JSON:
{"criterios": [{"nome": "...", "nota": 0, "comentario": "..."}], "pontosFortes": ["..."], "correcoes": [{"campo": "...", "trecho": "...", "problema": "...", "sugestao": "..."}]}`,
    )
    const parsed = parseJson<{ criterios?: unknown; pontosFortes?: unknown; correcoes?: unknown }>(answer)
    const rawCriteria = Array.isArray(parsed?.criterios) ? (parsed.criterios as Record<string, unknown>[]) : []
    const criteria = CRITERIA.map((nome) => {
      const c = rawCriteria.find((r) => typeof r?.nome === 'string' && r.nome.toLowerCase().startsWith(nome.slice(0, 12).toLowerCase()))
      const nota = Number(c?.nota)
      return { nome, nota: Number.isFinite(nota) ? Math.min(10, Math.max(0, Math.round(nota * 10) / 10)) : null, comentario: str(c?.comentario, 600) }
    }).filter((c): c is { nome: string; nota: number; comentario: string } => c.nota !== null)
    if (criteria.length === 0) throw new Error('A IA não retornou a avaliação.')
    const strengths = Array.isArray(parsed?.pontosFortes)
      ? parsed.pontosFortes.map((s) => str(s, 400)).filter(Boolean).slice(0, 3)
      : []
    return {
      nota: Math.round((criteria.reduce((sum, c) => sum + c.nota, 0) / criteria.length) * 10) / 10,
      criterios: criteria,
      pontosFortes: strengths,
      correcoes: findings(parsed?.correcoes, parts, ['problema']).slice(0, MAX_CORRECTIONS),
    }
  }

  const similarity = async (sources: Source[]) => {
    if (sources.length === 0) return { fontes: 0, trechos: [] as (Finding & Record<string, string>)[] }
    const list = sources.map((s, i) => `[S${i + 1}] ${s.reference}\nResumo: ${s.abstract}`).join('\n\n')
    const answer = await generate(
      'revisao',
      SYSTEM,
      `Verifique se o texto abaixo reproduz trechos dos artigos citados, inclusive por tradução. Compare cada campo com os resumos das fontes.

Texto (cada campo marcado com <<campo id="..." titulo="...">>):
${document}

Fontes citadas (resumos do PubMed):
${list}

Aponte somente trechos (de até 60 palavras) que sejam:
- "cópia": texto idêntico ao da fonte;
- "tradução literal": a mesma frase da fonte traduzida palavra por palavra;
- "paráfrase muito próxima": mesma estrutura e sequência de ideias da fonte, só com troca de palavras.
Não aponte fatos comuns da área, definições curtas, nomes de escalas ou dados numéricos citados corretamente com a referência.
Para cada trecho: "campo" (id), "trecho" (cópia exata, caractere por caractere, do texto do pesquisador), "fonte" (ex.: "S3"), "tipo" e "sugestao" (reescrita com palavras e estrutura próprias, mantendo o sentido e as citações). No máximo ${MAX_SIMILAR} trechos; se não houver nenhum, devolva a lista vazia.

Responda apenas com um JSON:
{"trechos": [{"campo": "...", "trecho": "...", "fonte": "S1", "tipo": "...", "sugestao": "..."}]}`,
    )
    const parsed = parseJson<{ trechos?: unknown }>(answer)
    const items = findings(parsed?.trechos, parts, ['fonte', 'tipo']).slice(0, MAX_SIMILAR)
    return {
      fontes: sources.length,
      trechos: items.map((t) => {
        const n = Number(/\d+/.exec(t.fonte)?.[0])
        return { ...t, fonte: sources[n - 1]?.reference ?? '' }
      }),
    }
  }

  try {
    const started = Date.now()
    const dois = [
      ...new Set(
        (body.referencias ?? [])
          .slice(0, MAX_REFS)
          .map((r) => (typeof r === 'string' ? DOI.exec(r)?.[0].replace(/[.)\]]+$/, '') : undefined))
          .filter((d): d is string => !!d),
      ),
    ]
    const sources = idsForDois(dois)
      .then((ids) => fetchSources(ids, MAX_ABSTRACT))
      .catch(() => [] as Source[])
    const [q, checked] = await Promise.all([
      quality(),
      sources.then(similarity).catch((error: unknown) => {
        console.error('analise: similaridade falhou', error)
        return null
      }),
    ])
    const s = checked ?? { fontes: 0, trechos: [] }

    const totalWords = [...parts.values()].reduce((sum, t) => sum + words(t), 0)
    const similarWords = s.trechos.reduce((sum, t) => sum + words(t.trecho), 0)
    const percent = totalWords ? Math.round((similarWords / totalWords) * 1000) / 10 : 0
    console.log(`analise: ${parts.size} campos, ${dois.length} DOIs, ${s.fontes} fontes, ${Date.now() - started} ms`)

    return Response.json({
      qualidade: q,
      similaridade: {
        nivel: !checked ? 'erro' : s.fontes === 0 ? 'indisponivel' : percent <= 5 ? 'baixo' : percent <= 15 ? 'moderado' : 'alto',
        percentual: percent,
        fontesComparadas: s.fontes,
        referencias: (body.referencias ?? []).length,
        trechos: s.trechos,
      },
    })
  } catch (error) {
    return failureResponse(error)
  }
}
