import { clip, errorResponse, failureResponse, generate, hasKey, isRateLimited, NO_KEY_MESSAGE } from './_ia.js'
import { parseJson } from './_fontes.js'
import { findings, readProject, str, type ProjectBody } from './_projeto.js'

const MAX_CORRECTIONS = 15

const CRITERIA = [
  'Clareza e objetividade',
  'Gramática e ortografia',
  'Linguagem científica',
  'Organização e coesão',
  'Coerência entre as partes',
  'Adequação às exigências',
]

const MAX_PROBLEMS = 6

function problems(raw: unknown, parts: Map<string, string>) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const r = (item ?? {}) as Record<string, unknown>
      const options = Array.isArray(r.opcoes) ? (r.opcoes as Record<string, unknown>[]) : []
      return {
        criterio: str(r.criterio, 80),
        problema: str(r.problema, 800),
        campos: (Array.isArray(r.campos) ? r.campos : []).map((c) => str(c, 80)).filter((c) => parts.has(c)),
        opcoes: options
          .map((o) => ({ rotulo: str(o?.rotulo, 160), efeito: str(o?.efeito, 400) }))
          .filter((o) => o.rotulo)
          .slice(0, 3),
      }
    })
    .filter((p) => p.problema && p.campos.length > 0 && p.opcoes.length >= 2)
    .slice(0, MAX_PROBLEMS)
}

const SYSTEM =
  'Você é um revisor experiente de projetos de pesquisa (sistema CEP/CONEP) e de artigos originais da área da saúde, rigoroso e construtivo.'

export async function POST(request: Request): Promise<Response> {
  if (!hasKey()) return errorResponse(NO_KEY_MESSAGE, 503)
  if (isRateLimited(request, 15)) return errorResponse('Muitos pedidos seguidos. Tente de novo daqui a pouco.', 429)

  let body: ProjectBody
  try {
    body = (await request.json()) as ProjectBody
  } catch {
    return errorResponse('Pedido inválido.', 400)
  }
  const { parts, document } = readProject(body)
  if (parts.size === 0) return errorResponse('Preencha o texto antes de pedir a análise.', 400)

  const project = body.fase === 1
  const requirements = project
    ? 'exigências do sistema CEP/CONEP (Resolução CNS 466/2012): riscos e formas de minimizá-los, benefícios, consentimento, coleta só após aprovação, TCLE em linguagem acessível ao participante'
    : `itens da diretriz de relato${body.guideline ? ` ${clip(body.guideline, 200)}` : ''} para um artigo original`

  try {
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

Por fim, liste até ${MAX_PROBLEMS} problemas maiores que precisam de uma decisão do pesquisador para serem corrigidos, principalmente os que tiraram pontos dos critérios com nota abaixo de 8 (incoerências entre partes, justificativas que faltam, textos inadequados ao público, exigências não atendidas). Para cada um:
- "criterio": o nome do critério afetado;
- "problema": o que está errado, em uma ou duas frases;
- "campos": os ids dos campos que precisariam mudar;
- "opcoes": de 2 a 3 formas diferentes e concretas de corrigir, cada uma com "rotulo" (até 12 palavras, começando por verbo) e "efeito" (o que muda no texto, em uma frase).

Responda apenas com um JSON:
{"criterios": [{"nome": "...", "nota": 0, "comentario": "..."}], "pontosFortes": ["..."], "correcoes": [{"campo": "...", "trecho": "...", "problema": "...", "sugestao": "..."}], "problemas": [{"criterio": "...", "problema": "...", "campos": ["..."], "opcoes": [{"rotulo": "...", "efeito": "..."}]}]}`,
    )
    const parsed = parseJson<{ criterios?: unknown; pontosFortes?: unknown; correcoes?: unknown; problemas?: unknown }>(
      answer,
    )
    const rawCriteria = Array.isArray(parsed?.criterios) ? (parsed.criterios as Record<string, unknown>[]) : []
    const criteria = CRITERIA.map((nome) => {
      const c = rawCriteria.find(
        (r) => typeof r?.nome === 'string' && r.nome.toLowerCase().startsWith(nome.slice(0, 12).toLowerCase()),
      )
      const nota = Number(c?.nota)
      return {
        nome,
        nota: Number.isFinite(nota) ? Math.min(10, Math.max(0, Math.round(nota * 10) / 10)) : null,
        comentario: str(c?.comentario, 600),
      }
    }).filter((c): c is { nome: string; nota: number; comentario: string } => c.nota !== null)
    if (criteria.length === 0) return errorResponse('A IA não retornou a avaliação. Tente de novo.', 502)

    return Response.json({
      nota: Math.round((criteria.reduce((sum, c) => sum + c.nota, 0) / criteria.length) * 10) / 10,
      criterios: criteria,
      pontosFortes: Array.isArray(parsed?.pontosFortes)
        ? parsed.pontosFortes.map((s) => str(s, 400)).filter(Boolean).slice(0, 3)
        : [],
      correcoes: findings(parsed?.correcoes, parts, ['problema']).slice(0, MAX_CORRECTIONS),
      problemas: problems(parsed?.problemas, parts),
    })
  } catch (error) {
    return failureResponse(error)
  }
}
