import type { Values } from '../data/types'

export interface TitleSuggestion {
  titulo: string
  motivo: string
}

export interface Review {
  revisado: string
  observacoes: string[]
}

async function post<T>(path: string, body: unknown, fallbackError: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique a internet e tente de novo.')
  }
  const data = (await response.json().catch(() => ({}))) as T & { erro?: string }
  if (!response.ok) throw new Error(data.erro ?? fallbackError)
  return data
}

const first = (v: Values, ...ids: string[]) => ids.map((id) => (v[id] ?? '').trim()).find(Boolean) ?? ''

export async function suggestTitles(
  kind: 'cientifico' | 'publico',
  draft: string,
  values: Values,
  studyTypeName: string | undefined,
): Promise<TitleSuggestion[]> {
  const context = {
    tipoEstudo: studyTypeName ?? '',
    desenho: first(values, 'pb_desenho', 'met_desenho'),
    objetivo: first(values, 'pb_objetivo_primario', 'intro_objetivo'),
    area: first(values, 'pb_area_saude'),
    descritores: first(values, 'pb_descritores', 'palavras_chave'),
    populacao: first(values, 'pb_inclusao'),
    desfecho: first(values, 'pb_desfecho_primario'),
  }
  const data = await post<{ sugestoes?: TitleSuggestion[] }>(
    '/api/titulos',
    { kind, draft, context },
    'Não foi possível gerar sugestões agora.',
  )
  if (!data.sugestoes?.length) throw new Error('Não foi possível gerar sugestões agora.')
  return data.sugestoes
}

export function reviewText(request: {
  text: string
  field: string
  help: string
  step: string
  studyType?: string
  guideline?: string
  plainLanguage: boolean
}): Promise<Review> {
  return post<Review>('/api/revisar', request, 'Não foi possível revisar o texto agora.')
}
