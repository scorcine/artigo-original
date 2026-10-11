import {
  alreadyListed,
  CITATION,
  citedIds,
  findSources,
  numberCitations,
  parseJson,
  sourceList as formatSources,
  type Source,
} from './_fontes.js'
import { clip, errorResponse, failureResponse, generate, hasKey, isRateLimited, NO_KEY_MESSAGE } from './_ia.js'

type Role = 'completa' | 'contexto' | 'justificativa'

interface Body {
  role?: Role
  field?: string
  studyType?: string
  context?: string
  existingRefs?: string[]
}

/** Uma linha de texto em A4, fonte 12 e margens ABNT tem cerca de 13 palavras. */
const WORDS_PER_LINE = 13
const MAX_LINES_WITHOUT_CITATION = 3
const MAX_PARAGRAPH_LINES = 10
const MAX_GAP_WORDS = WORDS_PER_LINE * MAX_LINES_WITHOUT_CITATION
const MAX_PARAGRAPH_WORDS = WORDS_PER_LINE * MAX_PARAGRAPH_LINES
const RECENT_YEARS = 5
const MAX_SOURCES = 30
const MIN_SOURCES = 15
const RESULTS_PER_QUERY = 15

const ROLE_GUIDE: Record<Role, string> = {
  completa: `Escreva a introdução completa do projeto, em 4 a 6 parágrafos, do geral para o específico:
1) o problema de saúde e sua relevância;
2) e 3) o estado da arte: o que os estudos recentes mostram, incluindo achados e controvérsias atuais;
4) a lacuna do conhecimento que este estudo pretende preencher;
último parágrafo) a justificativa: por que este estudo é necessário, sua relevância clínica e para a população estudada, e o que ele pode mudar na prática. Termine este parágrafo com o objetivo geral do estudo, em uma frase.`,
  contexto: `Escreva a parte de contexto da introdução de um artigo original, em 3 a 4 parágrafos, do geral para o específico: o problema de saúde e sua relevância, e o estado da arte (o que os estudos recentes mostram, incluindo achados e controvérsias atuais). Não escreva a justificativa nem o objetivo, que ficam em outros campos.`,
  justificativa: `Escreva a lacuna do conhecimento e a justificativa da introdução de um artigo original, em 1 a 2 parágrafos: o que ainda não se sabe segundo a literatura recente e por que este estudo é necessário e relevante. Não escreva o objetivo, que fica em outro campo.`,
}

const SYSTEM = `Você é um pesquisador sênior da área da saúde que escreve introduções de projetos e artigos originais com rigor acadêmico, em português do Brasil.
Regras que você nunca quebra:
- Toda afirmação científica precisa de citação, e você só pode citar as fontes fornecidas, usando os marcadores [S1], [S2] etc. Nunca invente fontes, autores, dados ou números.
- Cada fonte só pode ser citada uma única vez em todo o texto. Nunca repita uma referência.
- Números e achados só podem vir dos resumos fornecidos, sempre com a citação da fonte correspondente.
- Sem plágio: escreva com suas próprias palavras, sintetizando e comparando as fontes. Nunca traduza nem copie frases dos resumos.`

function words(text: string): string[] {
  return text.replace(CITATION, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w))
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/** Confere as regras de formato e devolve a lista de problemas encontrados. */
function checkRules(text: string, sourceCount: number): string[] {
  const issues: string[] = []
  paragraphs(text).forEach((paragraph, i) => {
    const total = words(paragraph).length
    if (total > MAX_PARAGRAPH_WORDS) {
      issues.push(
        `O parágrafo ${i + 1} tem cerca de ${Math.ceil(total / WORDS_PER_LINE)} linhas; o máximo é ${MAX_PARAGRAPH_LINES}.`,
      )
    }
    for (const segment of paragraph.split(CITATION)) {
      const segmentWords = words(segment)
      if (segmentWords.length > MAX_GAP_WORDS) {
        issues.push(
          `No parágrafo ${i + 1}, o trecho que começa com "${segmentWords.slice(0, 8).join(' ')}…" tem cerca de ${Math.ceil(segmentWords.length / WORDS_PER_LINE)} linhas sem referência; o máximo é ${MAX_LINES_WITHOUT_CITATION}.`,
        )
      }
    }
  })
  const timesCited = new Map<number, number>()
  for (const marker of text.match(CITATION) ?? []) {
    const ids = citedIds(marker)
    if (ids.some((n) => n < 1 || n > sourceCount)) issues.push(`A citação ${marker} não corresponde a nenhuma fonte.`)
    for (const id of new Set(ids)) timesCited.set(id, (timesCited.get(id) ?? 0) + 1)
  }
  for (const [id, times] of timesCited) {
    if (times > 1) {
      issues.push(`A fonte [S${id}] foi citada ${times} vezes; cada referência só pode aparecer uma vez no texto.`)
    }
  }
  return issues
}

export async function POST(request: Request): Promise<Response> {
  if (!hasKey()) return errorResponse(NO_KEY_MESSAGE, 503)
  if (isRateLimited(request, 20)) return errorResponse('Muitos pedidos seguidos. Tente de novo daqui a pouco.', 429)

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return errorResponse('Pedido inválido.', 400)
  }

  const role: Role = body.role === 'contexto' || body.role === 'justificativa' ? body.role : 'completa'
  const context = [
    body.studyType ? `Tipo de estudo: ${clip(body.studyType, 200)}` : '',
    clip(body.context, 12000),
  ]
    .filter(Boolean)
    .join('\n')
  if (context.length < 40) {
    return errorResponse('Preencha antes o título e o objetivo do estudo, para a IA saber o que buscar na literatura.', 400)
  }
  const existingRefs = (Array.isArray(body.existingRefs) ? body.existingRefs : [])
    .filter((l): l is string => typeof l === 'string')
    .slice(0, 300)

  const started = Date.now()
  const elapsed = () => `${Math.round((Date.now() - started) / 1000)}s`

  let sources: Source[]
  try {
    const found = await findSources(context, {
      focus:
        'A primeira deve ser bem específica para o tema do estudo; a segunda, um pouco mais ampla; a terceira, ampla, sobre o problema de saúde principal.',
      maxSources: MAX_SOURCES,
      minSources: MIN_SOURCES,
      resultsPerQuery: RESULTS_PER_QUERY,
      recentYears: RECENT_YEARS,
    })
    sources = found.filter((s) => !alreadyListed(s, existingRefs))
    console.log(`introducao: ${sources.length} fontes novas em ${elapsed()}`)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PubMed')) {
      console.error(error)
      return errorResponse('O PubMed não respondeu agora. Tente de novo em alguns minutos.', 503)
    }
    return failureResponse(error)
  }
  if (sources.length < 3) {
    return errorResponse(
      'Encontrei poucos artigos no PubMed sobre este tema. Deixe o título e o objetivo mais específicos e tente de novo.',
      422,
    )
  }

  const sourceList = formatSources(sources)

  const rules = `Regras obrigatórias de formato:
- Coloque uma citação [S#] no máximo a cada ${MAX_LINES_WITHOUT_CITATION} linhas (cerca de ${MAX_GAP_WORDS} palavras): na prática, cite ao final de cada frase com conteúdo científico. Várias fontes juntas: [S1,S4].
- Cada parágrafo deve ter no máximo ${MAX_PARAGRAPH_LINES} linhas (cerca de ${MAX_PARAGRAPH_WORDS} palavras). Separe os parágrafos com uma linha em branco.
- Cada fonte pode ser citada uma única vez em todo o texto: nunca repita um mesmo [S#]. Há ${sources.length} fontes disponíveis; ajuste o tamanho do texto para não precisar repetir nenhuma.
- Priorize as fontes mais recentes para descrever o estado da arte.
- Português científico formal, impessoal, sem tópicos e sem títulos.`

  try {
    const answer = await generate(
      'revisao',
      SYSTEM,
      `${ROLE_GUIDE[role]}

Informações do estudo:
"""
${context}
"""

Fontes disponíveis (artigos reais do PubMed; cite somente estas):
${sourceList}

${rules}

Responda apenas com um JSON: {"texto": "introdução com os marcadores [S#]", "pendencias": ["pontos que o pesquisador deve conferir, no máximo 3"]}`,
    )
    const first = parseJson<{ texto?: unknown; pendencias?: unknown }>(answer)
    let text = typeof first?.texto === 'string' ? first.texto.trim() : ''
    if (!text) return errorResponse('A IA não retornou a introdução. Tente de novo.', 502)

    let issues = checkRules(text, sources.length)
    console.log(`introducao: texto em ${elapsed()}, ${issues.length} problemas de regra`)
    if (issues.length > 0) {
      const fixed = parseJson<{ texto?: unknown }>(
        await generate(
          'revisao',
          SYSTEM,
          `O texto abaixo não cumpre todas as regras de formato. Corrija somente o necessário: divida parágrafos longos, acrescente citações das fontes disponíveis onde faltam e, quando uma fonte estiver repetida, mantenha-a em um só lugar e troque as outras ocorrências por fontes ainda não citadas que sustentem a frase (se nenhuma sustentar, reescreva ou retire a frase). Não invente nada.

Problemas encontrados:
${issues.map((i) => `- ${i}`).join('\n')}

${rules}

Fontes disponíveis:
${sourceList}

Texto:
"""
${text}
"""

Responda apenas com um JSON: {"texto": "texto corrigido com os marcadores [S#]"}`,
        ),
      )
      if (typeof fixed?.texto === 'string' && fixed.texto.trim()) {
        const fixedIssues = checkRules(fixed.texto.trim(), sources.length)
        if (fixedIssues.length <= issues.length) {
          text = fixed.texto.trim()
          issues = fixedIssues
        }
      }
      console.log(`introducao: correção em ${elapsed()}, ${issues.length} problemas restantes`)
    }

    const { text: numbered, newRefs } = numberCitations(text, sources, existingRefs)
    const notes = Array.isArray(first?.pendencias)
      ? first.pendencias.filter((n): n is string => typeof n === 'string' && n.trim() !== '').slice(0, 3)
      : []

    return Response.json({
      texto: numbered.replace(/\n\s*\n?/g, '\n\n'),
      referencias: newRefs,
      pendencias: [...issues.map((i) => `Regra não cumprida: ${i}`), ...notes],
      fontes: sources.length,
    })
  } catch (error) {
    return failureResponse(error)
  }
}
