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
  notes?: string
  guide?: string
}

const MAX_META = 1500
const MAX_CONTEXT = 16000
const MAX_NOTES = 6000

const SYSTEM = `Você é um pesquisador experiente da área da saúde que ajuda colegas a redigir projetos para o sistema CEP/CONEP (Plataforma Brasil) e artigos originais para periódicos.
Como você trabalha:
- Escolhas metodológicas que não foram informadas (desenho do estudo, critérios típicos, abordagem de análise, desfechos, riscos e benefícios usuais do procedimento): proponha a opção mais adequada à pergunta do estudo e escreva o texto completo com ela. Liste cada proposta nas pendências como "Confirme: ...", para o pesquisador validar.
- Fatos concretos do estudo que não foram informados (local, instituição, período, datas, números, tamanho da amostra, valores, nomes de pessoas ou instrumentos específicos): nunca invente; escreva [COMPLETAR: o que falta] no lugar.
- Nunca invente resultados nem referências bibliográficas, e não inclua citações.`

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

  const notes = clip(body.notes, MAX_NOTES)
  const guide = clip(body.guide, MAX_META)

  const prompt = `Escreva um rascunho para o campo descrito abaixo.

${about}
${
  notes
    ? `
Anotações do pesquisador para este campo (ideias soltas, não o texto final). São a base principal: desenvolva, organize e complete cada ideia, sem perder nenhuma e sem contradizê-las:
"""
${notes}
"""
`
    : ''
}
Informações já preenchidas pelo pesquisador em outros campos:
"""
${context || '(nenhuma informação preenchida ainda)'}
"""

Como escrever:
- ${style}
${guide ? `- Estrutura exigida para este campo:\n${guide}\n` : ''}- Escreva somente o conteúdo do campo, em parágrafos (ou na forma indicada pelo exemplo ou pela estrutura exigida), sem título.
- Escreva um texto completo e útil, específico para este estudo. Use [COMPLETAR: ...] só para fatos concretos que faltam, não para escolhas que você mesmo pode propor.
- Em "pendencias", liste de 0 a 5 itens: as propostas a confirmar ("Confirme: ...") e os fatos a completar.

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
