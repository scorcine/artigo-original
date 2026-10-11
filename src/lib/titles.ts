import type { Values } from '../data/types'

export interface TitleSuggestion {
  titulo: string
  motivo: string
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

  let response: Response
  try {
    response = await fetch('/api/titulos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, draft, context }),
    })
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique a internet e tente de novo.')
  }

  const data = (await response.json().catch(() => ({}))) as { sugestoes?: TitleSuggestion[]; erro?: string }
  if (!response.ok || !data.sugestoes) {
    throw new Error(data.erro ?? 'Não foi possível gerar sugestões agora.')
  }
  return data.sugestoes
}
