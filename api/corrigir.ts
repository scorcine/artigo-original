import { clip, errorResponse, failureResponse, generate, hasKey, isRateLimited, NO_KEY_MESSAGE } from './_ia.js'
import { parseJson } from './_fontes.js'
import { collapse, readProject, str, type ProjectBody } from './_projeto.js'

interface Body extends ProjectBody {
  problema?: { criterio?: string; problema?: string; campos?: string[] }
  escolha?: string
}

const MAX_CHANGES = 8

const SYSTEM =
  'Você é um pesquisador experiente da área da saúde que corrige projetos para o sistema CEP/CONEP e artigos originais, com cuidado para não alterar o que não precisa.'

export async function POST(request: Request): Promise<Response> {
  if (!hasKey()) return errorResponse(NO_KEY_MESSAGE, 503)
  if (isRateLimited(request, 40)) return errorResponse('Muitos pedidos seguidos. Tente de novo daqui a pouco.', 429)

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return errorResponse('Pedido inválido.', 400)
  }
  const { parts, titles, document } = readProject(body)
  const problem = str(body.problema?.problema, 800)
  const choice = str(body.escolha, 1500)
  if (parts.size === 0 || !problem || !choice) return errorResponse('Pedido inválido.', 400)
  const affected = (body.problema?.campos ?? []).filter((c) => parts.has(c))

  try {
    const answer = await generate(
      'revisao',
      SYSTEM,
      `Corrija o problema abaixo neste ${body.fase === 1 ? 'projeto de pesquisa para o CEP' : 'artigo original'}${body.studyType ? ` (${clip(body.studyType, 200)})` : ''}, do jeito que o pesquisador escolheu.

Problema (${str(body.problema?.criterio, 80) || 'qualidade'}): ${problem}
Campos mais afetados: ${affected.map((c) => `${c} (${titles.get(c)})`).join(', ') || 'não informado'}
Correção escolhida pelo pesquisador: ${choice}

Texto completo (cada campo marcado com <<campo id="..." titulo="...">>):
${document}

Regras:
- Aplique exatamente a correção escolhida, em todos os campos necessários para o texto ficar coerente (inclusive outros além dos mais afetados, se preciso). Se os campos não foram informados, encontre-os pelo texto do problema.
- Se o problema cita mais de um defeito, corrija todos. Quando houver uma contradição e o pesquisador não disse qual lado manter, mantenha o que está no objetivo e na metodologia e ajuste o resto.
- Se falta a justificativa de um número (ex.: tamanho da amostra), escreva a justificativa com os dados que já estão no texto e use [COMPLETAR: ...] para os parâmetros que faltarem.
- Altere só o necessário: mantenha idênticas as frases que não precisam mudar.
- Não invente dados concretos (números, locais, datas, nomes, resultados); onde faltar, escreva [COMPLETAR: o que falta].
- Campos do TCLE (ids que começam com "tcle_") são lidos pelos participantes: linguagem simples, sem jargão nem siglas, tratando o leitor por "você".
- Mantenha as citações numéricas existentes, como "(3)", e não acrescente referências novas.

Responda apenas com um JSON, com o texto completo e já corrigido de cada campo alterado:
{"resumo": "o que foi mudado, em uma ou duas frases", "alteracoes": [{"campo": "id", "texto": "texto completo do campo"}], "pendencias": ["o que o pesquisador ainda precisa completar ou conferir"]}`,
    )
    const parsed = parseJson<{ resumo?: unknown; alteracoes?: unknown; pendencias?: unknown }>(answer)
    const seen = new Set<string>()
    const changes = (Array.isArray(parsed?.alteracoes) ? (parsed.alteracoes as Record<string, unknown>[]) : [])
      .map((c) => ({ campo: str(c?.campo, 80), texto: str(c?.texto, 12000) }))
      .filter((c) => {
        const ok = parts.has(c.campo) && c.texto && collapse(c.texto) !== collapse(parts.get(c.campo) ?? '') && !seen.has(c.campo)
        seen.add(c.campo)
        return ok
      })
      .slice(0, MAX_CHANGES)
    if (changes.length === 0) return errorResponse('A IA não conseguiu aplicar essa correção. Tente de novo ou escolha outra forma.', 502)

    return Response.json({
      resumo: str(parsed?.resumo, 600),
      alteracoes: changes,
      pendencias: Array.isArray(parsed?.pendencias)
        ? parsed.pendencias.map((p) => str(p, 400)).filter(Boolean).slice(0, 5)
        : [],
    })
  } catch (error) {
    return failureResponse(error)
  }
}
