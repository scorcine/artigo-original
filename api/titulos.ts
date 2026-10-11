import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogle } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'

type Kind = 'cientifico' | 'publico'

interface Body {
  kind?: Kind
  draft?: string
  context?: Record<string, string>
}

const MAX_FIELD = 1500
const RATE_LIMIT = 30
const RATE_WINDOW_MS = 60 * 60 * 1000
const recent = new Map<string, number[]>()

function pickModel() {
  const override = process.env.TITULO_MODELO
  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey) return createOpenAI({ apiKey: openaiKey })(override || 'gpt-5.4-mini')
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY
  if (googleKey) return createGoogle({ apiKey: googleKey })(override || 'gemini-2.5-flash')
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (anthropicKey) return createAnthropic({ apiKey: anthropicKey })(override || 'claude-haiku-4-5')
  return null
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  hits.push(now)
  recent.set(ip, hits)
  return hits.length > RATE_LIMIT
}

const clip = (s: unknown) => (typeof s === 'string' ? s.trim().slice(0, MAX_FIELD) : '')

const CONTEXT_LABELS: Record<string, string> = {
  tipoEstudo: 'Tipo de estudo',
  desenho: 'Desenho do estudo',
  objetivo: 'Objetivo',
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
  const model = pickModel()
  if (!model) {
    return Response.json(
      { erro: 'As sugestões de título ainda não estão ativadas: falta configurar a chave da IA na Vercel.' },
      { status: 503 },
    )
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido'
  if (isRateLimited(ip)) {
    return Response.json({ erro: 'Muitos pedidos seguidos. Tente de novo daqui a pouco.' }, { status: 429 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return Response.json({ erro: 'Pedido inválido.' }, { status: 400 })
  }

  const kind: Kind = body.kind === 'publico' ? 'publico' : 'cientifico'
  const draft = clip(body.draft)
  const context = Object.entries(CONTEXT_LABELS)
    .map(([key, label]) => [label, clip(body.context?.[key])] as const)
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n')

  if (!draft && !context) {
    return Response.json({ erro: 'Escreva um título ou preencha o objetivo do estudo antes de pedir sugestões.' }, { status: 400 })
  }

  const prompt = `${GUIDES[kind]}

Use somente as informações abaixo. Não invente dados como local, ano, número de participantes ou resultados.

Título escrito pelo pesquisador: ${draft || '(ainda não escrito)'}
${context ? `\nInformações do estudo:\n${context}` : ''}

Responda apenas com um JSON no formato:
[{"titulo": "...", "motivo": "frase curta dizendo o que melhorou em relação ao título original"}]
Gere 5 opções diferentes entre si, em português do Brasil.`

  try {
    const { text } = await generateText({
      model,
      system: 'Você é um editor de periódicos científicos da área da saúde, experiente em títulos de artigos originais.',
      prompt,
      maxRetries: 1,
    })
    const json = text.match(/\[[\s\S]*\]/)?.[0]
    const parsed: unknown = json ? JSON.parse(json) : null
    const suggestions = Array.isArray(parsed)
      ? parsed
          .filter((s): s is { titulo: string; motivo?: string } => typeof s?.titulo === 'string' && s.titulo.trim() !== '')
          .slice(0, 5)
          .map((s) => ({ titulo: s.titulo.trim(), motivo: typeof s.motivo === 'string' ? s.motivo.trim() : '' }))
      : []
    if (suggestions.length === 0) {
      return Response.json({ erro: 'A IA não retornou sugestões. Tente de novo.' }, { status: 502 })
    }
    return Response.json({ sugestoes: suggestions })
  } catch (error) {
    console.error('Falha ao gerar títulos', error)
    return Response.json(
      { erro: 'Não foi possível falar com o serviço de IA. Confira se a chave está correta e tem crédito.' },
      { status: 502 },
    )
  }
}
