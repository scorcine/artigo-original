import type { StepId, Values } from '../data/types'

const KEY = 'artigo-original:rascunho:v2'
const LEGACY_KEY = 'artigo-original:rascunho:v1'

export interface Draft {
  typeId: string | null
  values: Values
  stepId: StepId
}

export function emptyDraft(): Draft {
  return { typeId: null, values: {}, stepId: 'tipo' }
}

export function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY)
    if (!raw) return emptyDraft()
    const d = JSON.parse(raw)
    return {
      typeId: typeof d.typeId === 'string' ? d.typeId : null,
      values: d.values && typeof d.values === 'object' ? d.values : {},
      stepId: typeof d.stepId === 'string' ? d.stepId : 'tipo',
    }
  } catch {
    return emptyDraft()
  }
}

export function saveDraft(draft: Draft): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    // Armazenamento cheio ou bloqueado: o rascunho segue apenas em memória.
  }
}
