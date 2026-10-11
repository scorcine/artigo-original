import { clip, errorResponse, failureResponse, generate, hasKey, isRateLimited, NO_KEY_MESSAGE } from './_ia.js'

interface Body {
  field?: string
  help?: string
  example?: string
  step?: string
  studyType?: string
  guideline?: string
  plainLanguage?: boolean
  context?: string
}

const MAX_META = 1500
const MAX_CONTEXT = 16000

const SYSTEM = `Você é um pesquisador experiente da área da saúde que ajuda colegas a redigir projetos para o sistema CEP/CONEP (Plataforma Brasil) e artigos originais para periódicos.
Regras que você nunca quebra:
- Use somente as informações do estudo fornecidas. Não invente dados, números, resultados, locais, datas, nomes de instituições, instrumentos ou referências bibliográficas.
- Não inclua citações nem referências.
- Quando faltar uma informação necessária, escreva um marcador no lugar, no formato [COMPLETAR: o que falta], para o pesquisador preencher.
- Você pode usar conhecimento metodológico geral (por exemplo, explicar por que um desenho de estudo é adequado), desde que não afirme nada específico sobre este estudo que não tenha sido informado.`

export async function POST(request: Request): Promise<Response> {
  if (!hasKey()) return errorResponse(NO_KEY_MESSAGE, 503)
  if (isRateLimited(request, 60)) return errorResponse('Muitos pedidos seguidos. Tente de novo daqui a pouco.', 429)

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return errorResponse('Pedido inválido.', 400)
  }

  const field = clip(body.field, MAX_META)
  if (!field) return errorResponse('Pedido inválido.', 400)
  const context = clip(body.context, MAX_CONTEXT)

  const style = body.plainLanguage
    ? 'O texto será lido por participantes leigos: use linguagem simples, frases curtas, sem jargão técnico e sem siglas, tratando o leitor por "você".'
    : 'Use português científico formal, impessoal, claro e conciso, adequado a projetos de pesquisa e periódicos da área da saúde.'

  const about = [
    ['Etapa', clip(body.step, MAX_META)],
    ['Campo a escrever', field],
    ['O que o campo deve conter', clip(body.help, MAX_META)],
    ['Exemplo de formato (de outro estudo; não copie o conteúdo)', clip(body.example, MAX_META)],
    ['Tipo de estudo', clip(body.studyType, MAX_META)],
    ['Diretriz de relato', clip(body.guideline, MAX_META)],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n')

  const prompt = `Escreva um rascunho para o campo descrito abaixo.

${about}

Informações já preenchidas pelo pesquisador:
"""
${context || '(nenhuma informação preenchida ainda)'}
"""

Como escrever:
- ${style}
- Escreva somente o conteúdo do campo, em parágrafos (ou na forma indicada pelo exemplo), sem título.
- Seja específico com o que foi informado e use [COMPLETAR: ...] para cada informação essencial que faltar.
- Em "pendencias", liste de 0 a 5 informações que o pesquisador precisa decidir ou completar.

Responda apenas com um JSON no formato:
{"texto": "rascunho do campo", "pendencias": ["...", "..."]}`

  try {
    const answer = await generate('revisao', SYSTEM, prompt)
    const json = answer.match(/\{[\s\S]*\}/)?.[0]
    const parsed = (json ? JSON.parse(json) : null) as { texto?: unknown; pendencias?: unknown } | null
    const text = typeof parsed?.texto === 'string' ? parsed.texto.trim() : ''
    if (!text) return errorResponse('A IA não retornou o rascunho. Tente de novo.', 502)
    const pending = Array.isArray(parsed?.pendencias)
      ? parsed.pendencias.filter((n): n is string => typeof n === 'string' && n.trim() !== '').slice(0, 5)
      : []
    return Response.json({ texto: text, pendencias: pending })
  } catch (error) {
    return failureResponse(error)
  }
}
