import { clip, errorResponse, failureResponse, generate, hasKey, isRateLimited, NO_KEY_MESSAGE } from './_ia.js'
import { parseJson } from './_fontes.js'

interface Body {
  studyType?: string
  context?: string
}

interface RawStage {
  etapa?: unknown
  inicioSemana?: unknown
  duracaoSemanas?: unknown
  aposAprovacao?: unknown
}

const MAX_CONTEXT = 16000
const MAX_STAGES = 12
const MAX_WEEKS = 260
const MIN_ETHICS_WEEKS = 6

const SYSTEM = `Você é um pesquisador experiente da área da saúde que monta cronogramas de projetos para o sistema CEP/CONEP (Plataforma Brasil).
Na Plataforma Brasil, cada etapa do cronograma tem identificação, data de início e data de término. O CEP devolve projetos em que a coleta de dados (ou qualquer contato com participantes ou acesso a prontuários) começa antes da aprovação ética.`

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN)

export async function POST(request: Request): Promise<Response> {
  if (!hasKey()) return errorResponse(NO_KEY_MESSAGE, 503)
  if (isRateLimited(request, 30)) return errorResponse('Muitos pedidos seguidos. Tente de novo daqui a pouco.', 429)

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return errorResponse('Pedido inválido.', 400)
  }
  const context = clip(body.context, MAX_CONTEXT)
  if (!context) return errorResponse('Preencha antes o desenho e a metodologia do estudo para montar o cronograma.', 400)

  const prompt = `Monte o cronograma deste projeto de pesquisa${body.studyType ? ` (${clip(body.studyType, 200)})` : ''}, com as principais etapas definidas pela metodologia.

Informações do projeto:
"""
${context}
"""

Regras:
- De 6 a 10 etapas, na ordem em que acontecem, com nomes curtos (até 90 caracteres) e específicos deste estudo (por exemplo, citando o exame, a intervenção ou o instrumento descritos na metodologia).
- A semana 0 é a data de submissão na Plataforma Brasil. A primeira etapa é "Submissão à Plataforma Brasil e apreciação pelo CEP", começando na semana 0, com pelo menos ${MIN_ETHICS_WEEKS} semanas (se o estudo precisar de análise da CONEP, use pelo menos 12).
- Marque "aposAprovacao": true em toda etapa que envolva participantes, prontuários ou dados (treinamento com pacientes, recrutamento, coleta, intervenção, seguimento) e comece essas etapas depois do fim da apreciação ética.
- A duração da coleta deve ser coerente com o tamanho da amostra e com a forma de recrutamento descritos; se não houver dados para estimar, proponha uma duração plausível.
- Etapas podem se sobrepor quando isso fizer sentido (por exemplo, digitação dos dados durante a coleta).
- Inclua as etapas finais: análise estatística (ou análise dos dados), redação do artigo, envio do relatório final ao CEP e divulgação dos resultados.
- Em "pendencias", liste de 1 a 4 itens começando por "Confirme: ..." com as suposições que você fez (por exemplo, o ritmo de recrutamento usado para estimar a duração da coleta).

Responda apenas com um JSON:
{"etapas": [{"etapa": "...", "inicioSemana": 0, "duracaoSemanas": 8, "aposAprovacao": false}], "pendencias": ["..."]}`

  try {
    const answer = await generate('revisao', SYSTEM, prompt)
    const parsed = parseJson<{ etapas?: RawStage[]; pendencias?: unknown }>(answer)
    const raw = Array.isArray(parsed?.etapas) ? parsed.etapas.slice(0, MAX_STAGES) : []
    const stages = raw
      .map((s) => ({
        etapa: typeof s.etapa === 'string' ? clip(s.etapa.trim(), 120) : '',
        inicioSemana: Math.max(0, Math.round(num(s.inicioSemana))),
        duracaoSemanas: Math.max(1, Math.round(num(s.duracaoSemanas))),
        aposAprovacao: s.aposAprovacao === true,
      }))
      .filter((s) => s.etapa && Number.isFinite(s.inicioSemana) && Number.isFinite(s.duracaoSemanas))
      .map((s) => ({ ...s, duracaoSemanas: Math.min(s.duracaoSemanas, MAX_WEEKS) }))
    if (stages.length < 3) return errorResponse('A IA não retornou o cronograma. Tente de novo.', 502)

    const ethics = stages[0]
    ethics.inicioSemana = 0
    ethics.duracaoSemanas = Math.max(ethics.duracaoSemanas, MIN_ETHICS_WEEKS)
    const approval = ethics.duracaoSemanas
    for (const s of stages.slice(1)) {
      if (s.aposAprovacao && s.inicioSemana < approval) s.inicioSemana = approval
    }

    const pending = Array.isArray(parsed?.pendencias)
      ? parsed.pendencias.filter((n): n is string => typeof n === 'string' && n.trim() !== '').slice(0, 4)
      : []
    return Response.json({
      etapas: stages.map(({ etapa, inicioSemana, duracaoSemanas }) => ({ etapa, inicioSemana, duracaoSemanas })),
      pendencias: pending,
    })
  } catch (error) {
    return failureResponse(error)
  }
}
