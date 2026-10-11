import { useState } from 'react'
import type { Field, StudyType, Values } from './data/types'
import {
  computeSample,
  DEFAULT_INPUT,
  describeSample,
  KIND_LABELS,
  type SampleInput,
  type SampleKind,
} from './lib/amostra'
import { studyContext, suggestSampleParameters } from './lib/ia'
import { lines } from './lib/manuscript'

type Raw = Record<string, string>

interface InputSpec {
  key: keyof SampleInput
  label: string
  suffix?: string
  text?: boolean
  optional?: boolean
}

const INPUTS: Record<SampleKind, InputSpec[]> = {
  'duas-proporcoes': [
    { key: 'group1', label: 'Nome do grupo 1', text: true },
    { key: 'p1', label: 'Desfecho esperado no grupo 1', suffix: '%' },
    { key: 'group2', label: 'Nome do grupo 2', text: true },
    { key: 'p2', label: 'Desfecho esperado no grupo 2', suffix: '%' },
    { key: 'ratio', label: 'Participantes do grupo 2 para cada 1 do grupo 1' },
  ],
  prevalencia: [
    { key: 'p', label: 'Prevalência esperada', suffix: '%' },
    { key: 'precision', label: 'Precisão (margem de erro)', suffix: 'pontos %' },
    { key: 'population', label: 'Tamanho da população, se for pequena e conhecida', optional: true },
  ],
  'duas-medias': [
    { key: 'meanDiff', label: 'Diferença mínima relevante entre as médias' },
    { key: 'sd', label: 'Desvio padrão do desfecho' },
    { key: 'unit', label: 'Unidade de medida', text: true, optional: true },
    { key: 'ratio', label: 'Participantes do grupo 2 para cada 1 do grupo 1' },
  ],
  diagnostico: [
    { key: 'sensitivity', label: 'Sensibilidade esperada', suffix: '%' },
    { key: 'specificity', label: 'Especificidade esperada', suffix: '%' },
    { key: 'prevalence', label: 'Prevalência da condição na população', suffix: '%' },
    { key: 'precision', label: 'Precisão (margem de erro)', suffix: 'pontos %' },
  ],
}

const TESTS: SampleKind[] = ['duas-proporcoes', 'duas-medias']

const toRaw = (input: SampleInput): Raw =>
  Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, typeof v === 'number' ? (Number.isNaN(v) ? '' : String(v).replace('.', ',')) : v]),
  )

function fromRaw(raw: Raw): SampleInput {
  const input = { ...DEFAULT_INPUT }
  for (const [key, value] of Object.entries(raw)) {
    const k = key as keyof SampleInput
    if (!(k in DEFAULT_INPUT)) continue
    if (typeof DEFAULT_INPUT[k] === 'number') {
      ;(input as Record<string, unknown>)[k] = value.trim() === '' ? NaN : Number(value.replace(',', '.'))
    } else {
      ;(input as Record<string, unknown>)[k] = value
    }
  }
  return input
}

const RAW_TO_INPUT: Record<string, keyof SampleInput> = { grupo1: 'group1', grupo2: 'group2' }

interface Basis {
  text: string
  references: string[]
  warnings: string[]
}

export function SampleSizeCalculator({
  field,
  values,
  type,
  bibliographyId,
  onChange,
}: {
  field: Field
  values: Values
  type: StudyType | null
  bibliographyId: string
  onChange: (id: string, value: string) => void
}) {
  const storageId = `${field.id}__calculo`
  const [raw, setRaw] = useState<Raw>(() => {
    try {
      const saved = values[storageId]
      if (saved) return JSON.parse(saved) as Raw
    } catch {
      /* cálculo salvo inválido: recomeça */
    }
    return toRaw({ ...DEFAULT_INPUT, kind: type?.id === 'diagnostico' ? 'diagnostico' : 'duas-proporcoes' })
  })
  const [open, setOpen] = useState(Boolean(values[storageId]))
  const [basis, setBasis] = useState<Basis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [undo, setUndo] = useState<{ text: string; bibliography: string } | null>(null)

  const input = fromRaw(raw)
  const kind = input.kind
  const result = computeSample(input)

  const update = (changes: Raw) => {
    const next = { ...raw, ...changes }
    setRaw(next)
    onChange(storageId, JSON.stringify(next))
  }

  const changeKind = (next: SampleKind) => {
    setBasis(null)
    update({ kind: next })
  }

  const suggest = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await suggestSampleParameters({
        kind,
        context: [type ? `Tipo de estudo: ${type.name}` : '', studyContext(values, type, field.id)].filter(Boolean).join('\n'),
        existingRefs: lines(values[bibliographyId] ?? ''),
      })
      const changes: Raw = {}
      for (const [key, value] of Object.entries(data.valores)) {
        changes[RAW_TO_INPUT[key] ?? key] = typeof value === 'number' ? String(value).replace('.', ',') : value
      }
      update(changes)
      setBasis({ text: data.base, references: data.referencias, warnings: data.avisos })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível buscar os valores agora.')
    } finally {
      setLoading(false)
    }
  }

  const insert = () => {
    if (typeof result === 'string') return
    const current = values[field.id] ?? ''
    if (current.trim() && !window.confirm('Substituir o texto atual do campo pelo cálculo?')) return
    const bibliography = values[bibliographyId] ?? ''
    setUndo({ text: current, bibliography })
    onChange(field.id, describeSample(input, result, basis?.text ?? ''))
    if (basis?.references.length) {
      const added = basis.references.join('\n')
      onChange(bibliographyId, bibliography.trim() ? `${bibliography.trimEnd()}\n${added}` : added)
    }
  }

  if (!open) {
    return (
      <div className="sample-calc closed">
        <button type="button" className="suggest" onClick={() => setOpen(true)}>
          Calcular tamanho da amostra
        </button>
      </div>
    )
  }

  return (
    <div className="sample-calc">
      <p className="review-heading">Calculadora de tamanho amostral</p>

      <div className="choices" role="radiogroup" aria-label="Tipo de cálculo">
        {(Object.keys(KIND_LABELS) as SampleKind[]).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            className={`choice${kind === k ? ' selected' : ''}`}
            onClick={() => changeKind(k)}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>

      <div className="text-review-actions calc-suggest">
        <button type="button" className="suggest" onClick={suggest} disabled={loading}>
          {loading ? 'Buscando valores no PubMed…' : 'Sugerir valores pela literatura (PubMed)'}
        </button>
      </div>
      {loading && <p className="help">A IA está lendo artigos sobre o tema; pode levar até 1 minuto.</p>}
      {error && <p className="suggest-error">{error}</p>}
      {basis && (
        <div className="calc-basis">
          {basis.text && <p>{basis.text}</p>}
          {basis.references.length > 0 && (
            <ol className="review-refs">
              {basis.references.map((ref) => (
                <li key={ref}>{ref}</li>
              ))}
            </ol>
          )}
          {basis.warnings.length > 0 && (
            <ul>
              {basis.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="calc-grid">
        {INPUTS[kind].map((spec) => (
          <label key={spec.key} className="calc-input">
            <span>
              {spec.label}
              {spec.optional && <span className="optional">opcional</span>}
            </span>
            <span className="calc-value">
              <input
                type="text"
                inputMode={spec.text ? 'text' : 'decimal'}
                value={raw[spec.key] ?? ''}
                onChange={(e) => update({ [spec.key]: e.target.value })}
              />
              {spec.suffix && <span className="calc-suffix">{spec.suffix}</span>}
            </span>
          </label>
        ))}
        {TESTS.includes(kind) ? (
          <>
            <Pills label="Nível de significância" options={['5', '1']} suffix="%" value={raw.alpha} onPick={(v) => update({ alpha: v })} />
            <Pills label="Poder" options={['80', '90']} suffix="%" value={raw.power} onPick={(v) => update({ power: v })} />
          </>
        ) : (
          <Pills label="Nível de confiança" options={['95', '99']} suffix="%" value={raw.confidence} onPick={(v) => update({ confidence: v })} />
        )}
        <label className="calc-input">
          <span>Perdas e recusas previstas</span>
          <span className="calc-value">
            <input type="text" inputMode="decimal" value={raw.losses ?? ''} onChange={(e) => update({ losses: e.target.value })} />
            <span className="calc-suffix">%</span>
          </span>
        </label>
      </div>

      {typeof result === 'string' ? (
        <p className="help">{result}</p>
      ) : (
        <div className="calc-result">
          {result.groups.length > 1 ? (
            <p>
              <strong>{result.groups.map((g) => `${g.final} no grupo ${g.label}`).join(' e ')}</strong> — total de{' '}
              <strong>{result.totalFinal} participantes</strong> (mínimo de {result.total} antes das perdas).
            </p>
          ) : (
            <p>
              <strong>{result.totalFinal} participantes</strong> (mínimo de {result.total} antes das perdas).
            </p>
          )}
          <div className="text-review-actions">
            <button type="button" onClick={insert}>
              Usar este cálculo no campo
            </button>
            {undo && (
              <button
                type="button"
                className="link"
                onClick={() => {
                  onChange(field.id, undo.text)
                  onChange(bibliographyId, undo.bibliography)
                  setUndo(null)
                }}
              >
                Desfazer
              </button>
            )}
          </div>
        </div>
      )}
      <p className="help">
        O cálculo é feito com fórmulas estatísticas padrão, não pela IA. Os valores esperados são decisão do pesquisador: confira
        os sugeridos nos artigos citados ou use os de um estudo piloto.
      </p>
    </div>
  )
}

function Pills({
  label,
  options,
  suffix,
  value,
  onPick,
}: {
  label: string
  options: string[]
  suffix: string
  value: string
  onPick: (value: string) => void
}) {
  return (
    <div className="calc-input">
      <span>{label}</span>
      <div className="choices small">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`choice${value === option ? ' selected' : ''}`}
            onClick={() => onPick(option)}
          >
            {option}
            {suffix}
          </button>
        ))}
      </div>
    </div>
  )
}
