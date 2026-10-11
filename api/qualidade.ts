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

const MAX_PROBLEMS = 8
/** Critérios com nota abaixo disso precisam ter pelo menos um problema para corrigir. */
const NEEDS_FIX = 8

type Criterion = { nome: string; nota: number; comentario: string }
type Problem = { criterio: string; problema: string; campos: string[]; opcoes: { rotulo: string; efeito: string }[] }

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

/** A IA às vezes devolve o título do campo em vez do id. */
function fieldId(raw: string, titles: Map<string, string>): string | undefined {
  if (titles.has(raw)) return raw
  const wanted = norm(raw)
  if (!wanted) return undefined
  for (const [id, title] of titles) {
    const t = norm(title)
    if (t === wanted || norm(title.split(' › ').pop() ?? '') === wanted || t.endsWith(wanted)) return id
  }
  return undefined
}

function criterionOf(raw: string): string {
  const n = norm(raw)
  return CRITERIA.find((c) => n.startsWith(norm(c).slice(0, 12))) ?? raw
}

function problems(raw: unknown, titles: Map<string, string>, criteria: Criterion[]): Problem[] {
  const list: Problem[] = (Array.isArray(raw) ? raw : [])
    .map((item) => {
      const r = (item ?? {}) as Record<string, unknown>
      const options = Array.isArray(r.opcoes) ? (r.opcoes as Record<string, unknown>[]) : []
      const fields = (Array.isArray(r.campos) ? r.campos : [])
        .map((c) => fieldId(str(c, 200), titles))
        .filter((c): c is string => !!c)
      return {
        criterio: criterionOf(str(r.criterio, 80)),
        problema: str(r.problema, 800),
        campos: [...new Set(fields)],
        opcoes: options
          .map((o) => ({ rotulo: str(o?.rotulo, 160), efeito: str(o?.efeito, 400) }))
          .filter((o) => o.rotulo)
          .slice(0, 3),
      }
    })
    .filter((p) => p.problema && p.opcoes.length > 0)

  for (const c of criteria) {
    if (c.nota >= NEEDS_FIX || !c.comentario || list.some((p) => p.criterio === c.nome)) continue
    list.push({
      criterio: c.nome,
      problema: c.comentario,
      campos: [],
      opcoes: [{ rotulo: 'Corrigir como a análise sugere', efeito: 'A IA ajusta todos os campos citados no comentário.' }],
    })
  }

  const score = (p: Problem) => criteria.find((c) => c.nome === p.criterio)?.nota ?? 10
  return list
    .map((p, i) => ({ p, i }))
    .sort((a, b) => score(a.p) - score(b.p) || a.i - b.i)
    .map(({ p }) => p)
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
  const { parts, titles, document } = readProject(body)
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

Em seguida, liste os PROBLEMAS (até ${MAX_PROBLEMS}), começando pelos mais graves. Esta é a parte mais importante:
- Todo defeito citado no comentário de um critério com nota abaixo de 9 deve virar um problema. Se um comentário cita dois defeitos (ex.: uma contradição e um tamanho de amostra sem justificativa), crie dois problemas separados.
- Inclua incoerências entre partes, justificativas ou cálculos que faltam, textos inadequados ao público (ex.: TCLE em linguagem técnica) e exigências não atendidas.
Para cada problema:
- "criterio": o nome exato do critério afetado;
- "problema": o que está errado, em uma ou duas frases, citando os campos;
- "campos": os ids (não os títulos) dos campos que precisariam mudar;
- "opcoes": de 2 a 3 formas diferentes e concretas de corrigir, cada uma com "rotulo" (até 12 palavras, começando por verbo) e "efeito" (o que muda no texto, em uma frase).

Depois liste até ${MAX_CORRECTIONS} correções pontuais, que não repitam os problemas acima, das mais importantes para as menos importantes (erros de português, frases confusas, termos imprecisos). Para cada uma:
- "campo": o id do campo;
- "trecho": cópia exata, caractere por caractere, de um trecho curto do campo (até 40 palavras) a ser substituído;
- "problema": o que está errado, em uma frase;
- "sugestao": o texto que deve substituir o trecho, pronto para uso, sem inventar dados (use [COMPLETAR: ...] se faltar uma informação concreta).
Por fim, até 3 pontos fortes.

Responda apenas com um JSON, nesta ordem:
{"criterios": [{"nome": "...", "nota": 0, "comentario": "..."}], "problemas": [{"criterio": "...", "problema": "...", "campos": ["..."], "opcoes": [{"rotulo": "...", "efeito": "..."}]}], "correcoes": [{"campo": "...", "trecho": "...", "problema": "...", "sugestao": "..."}], "pontosFortes": ["..."]}`,
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
    }).filter((c): c is Criterion => c.nota !== null)
    if (criteria.length === 0) return errorResponse('A IA não retornou a avaliação. Tente de novo.', 502)

    return Response.json({
      nota: Math.round((criteria.reduce((sum, c) => sum + c.nota, 0) / criteria.length) * 10) / 10,
      criterios: criteria,
      pontosFortes: Array.isArray(parsed?.pontosFortes)
        ? parsed.pontosFortes.map((s) => str(s, 400)).filter(Boolean).slice(0, 3)
        : [],
      correcoes: findings(parsed?.correcoes, parts, ['problema']).slice(0, MAX_CORRECTIONS),
      problemas: problems(parsed?.problemas, titles, criteria),
    })
  } catch (error) {
    return failureResponse(error)
  }
}
