const KEY = 'artigo-original:rascunho:v1'

export interface Draft {
  typeId: string | null
  values: Record<string, string>
  stepIndex: number
}

export function emptyDraft(): Draft {
  return { typeId: null, values: {}, stepIndex: 0 }
}

export function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyDraft()
    const d = JSON.parse(raw)
    return {
      typeId: typeof d.typeId === 'string' ? d.typeId : null,
      values: d.values && typeof d.values === 'object' ? d.values : {},
      stepIndex: Number.isInteger(d.stepIndex) ? d.stepIndex : 0,
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
