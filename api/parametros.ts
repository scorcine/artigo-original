import { CITATION, citedIds, findSources, numberCitations, parseJson, sourceList, type Source } from './_fontes.js'
import { clip, errorResponse, failureResponse, generate, hasKey, isRateLimited, NO_KEY_MESSAGE } from './_ia.js'

type Kind = 'duas-proporcoes' | 'prevalencia' | 'duas-medias' | 'diagnostico'

interface Body {
  kind?: Kind
  context?: string
  existingRefs?: string[]
}

const NEEDS: Record<Kind, { focus: string; ask: string; keys: string[] }> = {
  'duas-proporcoes': {
    focus: 'Priorize estudos que relatem a frequência (proporção ou prevalência) do desfecho principal nos grupos que o estudo vai comparar.',
    ask: `Valores necessários (em %): "p1" = proporção esperada do desfecho no grupo 1 e "p2" = no grupo 2. Informe também "grupo1" e "grupo2" com nomes curtos dos grupos (por exemplo, "controle" e "diabetes").`,
    keys: ['p1', 'p2'],
  },
  prevalencia: {
    focus: 'Priorize estudos que relatem a prevalência ou frequência do desfecho principal em populações semelhantes à do estudo.',
    ask: 'Valor necessário (em %): "p" = prevalência esperada do desfecho na população do estudo.',
    keys: ['p'],
  },
  'duas-medias': {
    focus: 'Priorize estudos que relatem médias e desvios padrão do desfecho principal nos grupos que o estudo vai comparar.',
    ask: 'Valores necessários: "meanDiff" = diferença esperada (ou mínima relevante) entre as médias dos grupos, "sd" = desvio padrão do desfecho e "unit" = unidade de medida (texto).',
    keys: ['meanDiff', 'sd'],
  },
  diagnostico: {
    focus: 'Priorize estudos de acurácia diagnóstica que relatem sensibilidade, especificidade e prevalência da condição para o teste estudado.',
    ask: 'Valores necessários (em %): "sensitivity" = sensibilidade esperada do teste, "specificity" = especificidade esperada e "prevalence" = prevalência da condição na população do estudo.',
    keys: ['sensitivity', 'specificity', 'prevalence'],
  },
}

const SYSTEM = `Você é bioestatístico da área da saúde e ajuda pesquisadores a escolher os parâmetros do cálculo amostral com base na literatura.
Regras que você nunca quebra:
- Use somente números que aparecem nos resumos fornecidos. Nunca invente valores.
- Cite a fonte de cada valor com os marcadores [S1], [S2] etc.
- Se os resumos não trouxerem um valor necessário, deixe-o como null e explique o que falta.`

/** Confere se o número aparece em algum resumo citado (como 25, 25.0, 25,0 ou 0.25). */
function appearsIn(value: number, abstracts: string): boolean {
  const variants = new Set<string>()
  for (const v of [value, value / 100]) {
    for (const digits of [0, 1, 2]) {
      const s = v.toFixed(digits)
      variants.add(s)
      variants.add(s.replace('.', ','))
    }
  }
  return [...variants].some((s) => new RegExp(`(^|[^0-9.,])${s.replace(/[.,]/g, '[.,]')}([^0-9]|$)`).test(abstracts))
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

  const kind: Kind = body.kind && body.kind in NEEDS ? body.kind : 'duas-proporcoes'
  const need = NEEDS[kind]
  const context = clip(body.context, 12000)
  if (context.length < 40) {
    return errorResponse('Preencha antes o título, o objetivo e o desfecho do estudo, para a IA saber o que buscar.', 400)
  }
  const existingRefs = (Array.isArray(body.existingRefs) ? body.existingRefs : []).filter((l): l is string => typeof l === 'string')

  let sources: Source[]
  try {
    sources = await findSources(context, {
      focus: `${need.focus} A primeira busca deve ser bem específica; a segunda, um pouco mais ampla; a terceira, ampla.`,
      maxSources: 15,
      minSources: 8,
      resultsPerQuery: 8,
      recentYears: 10,
    })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PubMed')) {
      console.error(error)
      return errorResponse('O PubMed não respondeu agora. Tente de novo em alguns minutos.', 503)
    }
    return failureResponse(error)
  }
  if (sources.length === 0) {
    return errorResponse('Não encontrei artigos no PubMed com esses dados. Preencha os valores com base em um estudo piloto ou em artigos que você conheça.', 422)
  }

  try {
    const answer = await generate(
      'revisao',
      SYSTEM,
      `Escolha, com base nos resumos abaixo, os parâmetros para o cálculo do tamanho amostral deste estudo.

Estudo:
"""
${context}
"""

${need.ask}

Fontes (artigos reais do PubMed):
${sourceList(sources)}

Em "base", escreva 1 a 2 frases em português científico explicando de onde vêm os valores, com os marcadores [S#] (por exemplo: "As proporções esperadas foram baseadas em estudos prévios que encontraram ... [S2,S5].").
Em "aviso", diga em uma frase se os valores vêm de populações diferentes da do estudo ou se falta algum valor (ou deixe vazio).

Responda apenas com um JSON: {"valores": {${need.keys.map((k) => `"${k}": número ou null`).join(', ')}${kind === 'duas-proporcoes' ? ', "grupo1": "...", "grupo2": "..."' : ''}${kind === 'duas-medias' ? ', "unit": "..."' : ''}}, "base": "...", "aviso": "..."}`,
    )
    const parsed = parseJson<{ valores?: Record<string, unknown>; base?: unknown; aviso?: unknown }>(answer)
    const raw = parsed?.valores ?? {}
    const values: Record<string, number | string> = {}
    for (const key of need.keys) {
      const v = typeof raw[key] === 'string' ? Number(String(raw[key]).replace(',', '.')) : raw[key]
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) values[key] = v
    }
    for (const key of ['grupo1', 'grupo2', 'unit']) {
      if (typeof raw[key] === 'string' && raw[key]) values[key] = clip(raw[key], 60)
    }

    const base = typeof parsed?.base === 'string' ? parsed.base.trim() : ''
    const cited = new Set((base.match(CITATION) ?? []).flatMap(citedIds))
    const citedAbstracts = [...cited].map((n) => sources[n - 1]?.abstract ?? '').join(' ')
    const notes: string[] = []
    if (typeof parsed?.aviso === 'string' && parsed.aviso.trim()) notes.push(parsed.aviso.trim())
    for (const key of need.keys) {
      const v = values[key]
      if (typeof v === 'number' && !appearsIn(v, citedAbstracts)) {
        notes.push(`O valor ${String(v).replace('.', ',')} não aparece literalmente nos resumos citados (pode ter sido calculado a partir deles): confira no artigo.`)
      }
    }
    if (need.keys.some((k) => values[k] === undefined)) {
      notes.push('A literatura encontrada não trouxe todos os valores necessários: complete os que faltam com base em um estudo piloto ou em outro artigo.')
    }

    const { text, newRefs } = numberCitations(base, sources, existingRefs)
    return Response.json({ valores: values, base: text, referencias: newRefs, avisos: notes })
  } catch (error) {
    return failureResponse(error)
  }
}
