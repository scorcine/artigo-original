import { clip, errorResponse, failureResponse, generate, hasKey, isRateLimited, NO_KEY_MESSAGE } from './_ia.js'

type Kind = 'cientifico' | 'publico'

interface Body {
  kind?: Kind
  draft?: string
  instructions?: string
  context?: Record<string, string>
}

const MAX_FIELD = 3000

const CONTEXT_LABELS: Record<string, string> = {
  tipoEstudo: 'Tipo de estudo',
  desenho: 'Desenho do estudo',
  objetivo: 'Objetivo',
  resumo: 'Resumo',
  area: 'Área da saúde',
  descritores: 'Descritores',
  populacao: 'Critérios de inclusão (população)',
  desfecho: 'Desfecho primário',
}

const GUIDES: Record<Kind, string> = {
  cientifico: `Escreva títulos científicos para um artigo original ou projeto de pesquisa em saúde.
- Informativos: deixe claro o que foi estudado (intervenção ou exposição), em quem (população) e o desfecho principal, quando essas informações existirem.
- Inclua o desenho do estudo, de preferência após dois-pontos (por exemplo, ": ensaio clínico randomizado" ou ": estudo transversal").
- Entre 10 e 20 palavras. Sem abreviações nem siglas não consagradas. Sem pontos de exclamação nem perguntas retóricas.
- Não afirme resultados que não foram informados.`,
  publico: `Escreva títulos públicos para um projeto de pesquisa em saúde, que serão lidos por pessoas leigas.
- Linguagem simples, sem jargão técnico e sem siglas.
- Diga o que a pesquisa quer saber e com quem, em até 15 palavras.`,
}

export async function POST(request: Request): Promise<Response> {
  if (!hasKey()) return errorResponse(NO_KEY_MESSAGE, 503)
  if (isRateLimited(request, 30)) return errorResponse('Muitos pedidos seguidos. Tente de novo daqui a pouco.', 429)

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return errorResponse('Pedido inválido.', 400)
  }

  const kind: Kind = body.kind === 'publico' ? 'publico' : 'cientifico'
  const draft = clip(body.draft, MAX_FIELD)
  const instructions = clip(body.instructions, MAX_FIELD)
  const context = Object.entries(CONTEXT_LABELS)
    .map(([key, label]) => [label, clip(body.context?.[key], MAX_FIELD)] as const)
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n')

  if (!draft && !context && !instructions) {
    return errorResponse('Escreva um título ou preencha o objetivo do estudo antes de pedir sugestões.', 400)
  }

  const prompt = `${GUIDES[kind]}

Use somente as informações abaixo. Não invente dados como local, ano, número de participantes ou resultados.

Título escrito pelo pesquisador: ${draft || '(ainda não escrito)'}
${context ? `\nInformações do estudo:\n${context}` : ''}
${
  instructions
    ? `\nOrientações do pesquisador para os títulos (têm prioridade sobre as informações acima; se houver conflito, siga as orientações):\n${instructions}\n`
    : ''
}
Responda apenas com um JSON no formato:
[{"titulo": "...", "motivo": "frase curta dizendo o que melhorou em relação ao título original"}]
Gere 5 opções diferentes entre si, em português do Brasil.`

  try {
    const text = await generate(
      'titulos',
      'Você é um editor de periódicos científicos da área da saúde, experiente em títulos de artigos originais.',
      prompt,
    )
    const json = text.match(/\[[\s\S]*\]/)?.[0]
    const parsed: unknown = json ? JSON.parse(json) : null
    const suggestions = Array.isArray(parsed)
      ? parsed
          .filter((s): s is { titulo: string; motivo?: string } => typeof s?.titulo === 'string' && s.titulo.trim() !== '')
          .slice(0, 5)
          .map((s) => ({ titulo: s.titulo.trim(), motivo: typeof s.motivo === 'string' ? s.motivo.trim() : '' }))
      : []
    if (suggestions.length === 0) return errorResponse('A IA não retornou sugestões. Tente de novo.', 502)
    return Response.json({ sugestoes: suggestions })
  } catch (error) {
    return failureResponse(error)
  }
}
