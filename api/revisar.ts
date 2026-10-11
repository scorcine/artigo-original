import { generateText } from 'ai'
import { AI_FAILURE_MESSAGE, clip, errorResponse, isRateLimited, NO_KEY_MESSAGE, pickModel } from './_ia.js'

interface Body {
  text?: string
  field?: string
  help?: string
  step?: string
  studyType?: string
  guideline?: string
  plainLanguage?: boolean
}

const MAX_TEXT = 8000
const MAX_META = 600

const SYSTEM = `Você é um revisor de textos científicos da área da saúde, com experiência em projetos submetidos ao sistema CEP/CONEP (Plataforma Brasil) e em artigos originais para periódicos.
Regras que você nunca quebra:
- Não invente dados, números, resultados, locais, datas, nomes de instrumentos ou referências bibliográficas.
- Não acrescente citações nem referências. Se o texto tiver citações, mantenha-as exatamente como estão.
- Preserve o sentido e todas as informações do texto original.
- Se faltar alguma informação importante, não a crie: aponte a falta nas observações.`

export async function POST(request: Request): Promise<Response> {
  const model = pickModel('revisao')
  if (!model) return errorResponse(NO_KEY_MESSAGE, 503)
  if (isRateLimited(request, 60)) return errorResponse('Muitos pedidos seguidos. Tente de novo daqui a pouco.', 429)

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return errorResponse('Pedido inválido.', 400)
  }

  const text = clip(body.text, MAX_TEXT)
  if (text.length < 20) return errorResponse('Escreva um pouco mais antes de pedir a revisão.', 400)

  const style = body.plainLanguage
    ? 'O texto será lido por participantes leigos: use linguagem simples, frases curtas, sem jargão técnico e sem siglas, tratando o leitor por "você".'
    : 'Use português científico formal, impessoal, claro e conciso, adequado a periódicos da área da saúde.'

  const context = [
    ['Etapa', clip(body.step, MAX_META)],
    ['Campo', clip(body.field, MAX_META)],
    ['O que o campo deve conter', clip(body.help, MAX_META)],
    ['Tipo de estudo', clip(body.studyType, MAX_META)],
    ['Diretriz de relato', clip(body.guideline, MAX_META)],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n')

  const prompt = `Revise o texto abaixo, escrito por um pesquisador.

${context}

Como revisar:
- ${style}
- Corrija gramática, ortografia e pontuação, melhore a clareza e a organização das frases e elimine repetições.
- Mantenha o texto no mesmo tamanho aproximado; não transforme em tópicos se ele estiver em parágrafos.
- Nas observações, aponte de 0 a 4 itens importantes que faltam ou estão vagos para este campo (considerando a diretriz de relato, se houver). Não repita correções de escrita nas observações.

Texto original:
"""
${text}
"""

Responda apenas com um JSON no formato:
{"revisado": "texto revisado", "observacoes": ["...", "..."]}`

  try {
    const { text: answer } = await generateText({ model, system: SYSTEM, prompt, maxRetries: 1 })
    const json = answer.match(/\{[\s\S]*\}/)?.[0]
    const parsed = (json ? JSON.parse(json) : null) as { revisado?: unknown; observacoes?: unknown } | null
    const revised = typeof parsed?.revisado === 'string' ? parsed.revisado.trim() : ''
    if (!revised) return errorResponse('A IA não retornou o texto revisado. Tente de novo.', 502)
    const notes = Array.isArray(parsed?.observacoes)
      ? parsed.observacoes.filter((n): n is string => typeof n === 'string' && n.trim() !== '').slice(0, 4)
      : []
    return Response.json({ revisado: revised, observacoes: notes })
  } catch (error) {
    console.error('Falha ao revisar texto', error)
    return errorResponse(AI_FAILURE_MESSAGE, 502)
  }
}
