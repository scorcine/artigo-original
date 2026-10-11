import { useState } from 'react'
import type { Field, StudyType, Values } from './data/types'
import {
  computeSample,
  DEFAULT_INPUT,
  describeSample,
  inGroup,
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
  help: string
  suffix?: string
  text?: boolean
  optional?: boolean
}

const RATIO: InputSpec = {
  key: 'ratio',
  label: 'Participantes do grupo 2 para cada 1 do grupo 1',
  help: 'Deixe 1 para grupos do mesmo tamanho (o mais comum). Use 2 se o grupo 2 for ter o dobro de participantes.',
}

const PRECISION: InputSpec = {
  key: 'precision',
  label: 'Margem de erro aceitável',
  suffix: 'pontos %',
  help: 'Quanto o resultado pode variar para mais ou para menos. 5 é o mais usado; quanto menor, maior a amostra.',
}

const INPUTS: Record<SampleKind, InputSpec[]> = {
  'duas-proporcoes': [
    { key: 'group1', label: 'Nome do grupo 1', text: true, help: 'Por exemplo: diabéticos, tratamento, exposto.' },
    {
      key: 'p1',
      label: 'Quantos % do grupo 1 devem ter o desfecho',
      suffix: '%',
      help: 'Valor esperado, tirado de estudos parecidos ou de um piloto. Ex.: 25 se 1 em cada 4 tiver o desfecho.',
    },
    { key: 'group2', label: 'Nome do grupo 2', text: true, help: 'Por exemplo: não diabéticos, controle, não exposto.' },
    {
      key: 'p2',
      label: 'Quantos % do grupo 2 devem ter o desfecho',
      suffix: '%',
      help: 'Mesmo raciocínio, para o outro grupo. Quanto mais próximos os dois valores, maior a amostra.',
    },
    RATIO,
  ],
  prevalencia: [
    {
      key: 'p',
      label: 'Quantos % você espera encontrar',
      suffix: '%',
      help: 'Prevalência vista em estudos parecidos. Se não houver nenhuma ideia, use 50 (dá a maior amostra, por segurança).',
    },
    PRECISION,
    {
      key: 'population',
      label: 'Tamanho da população',
      optional: true,
      help: 'Só preencha se a população for pequena e conhecida (ex.: 800 pacientes operados por ano no hospital).',
    },
  ],
  'duas-medias': [
    {
      key: 'meanDiff',
      label: 'Menor diferença entre as médias que importa na prática',
      help: 'Ex.: se uma queda de 5 mmHg na pressão já é relevante clinicamente, digite 5. Use estudos parecidos como base.',
    },
    {
      key: 'sd',
      label: 'Desvio padrão do desfecho',
      help: 'Quanto o valor varia entre as pessoas. Nos artigos aparece como "média ± DP": em "130 ± 15 mmHg", o DP é 15.',
    },
    { key: 'unit', label: 'Unidade de medida', text: true, optional: true, help: 'Ex.: mmHg, mL, pontos na escala.' },
    RATIO,
  ],
  diagnostico: [
    {
      key: 'sensitivity',
      label: 'Sensibilidade esperada do teste',
      suffix: '%',
      help: 'De cada 100 doentes, quantos o teste acerta. Use o valor de estudos parecidos.',
    },
    {
      key: 'specificity',
      label: 'Especificidade esperada do teste',
      suffix: '%',
      help: 'De cada 100 pessoas sem a doença, quantas o teste acerta.',
    },
    {
      key: 'prevalence',
      label: 'Quantos % da população estudada têm a condição',
      suffix: '%',
      help: 'Frequência da doença no local onde o estudo será feito.',
    },
    PRECISION,
  ],
}

const KIND_HELP: Record<SampleKind, string> = {
  'duas-proporcoes':
    'Use quando o desfecho é "sim ou não" e você vai comparar dois grupos. Ex.: % com estômago cheio em diabéticos x não diabéticos.',
  prevalencia:
    'Use quando o desfecho é "sim ou não" e você quer saber a frequência em um único grupo, sem comparar. Ex.: % de pacientes com estômago cheio antes da cirurgia.',
  'duas-medias':
    'Use quando o desfecho é um número (pressão, volume em mL, escore de dor) e você vai comparar dois grupos.',
  diagnostico: 'Use quando o objetivo é saber se um teste ou exame acerta o diagnóstico, comparado a um padrão de referência.',
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
  reason: string
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

  const suggest = async (requested: SampleKind | 'auto') => {
    setLoading(true)
    setError('')
    setBasis(null)
    try {
      const data = await suggestSampleParameters({
        kind: requested,
        context: [type ? `Tipo de estudo: ${type.name}` : '', studyContext(values, type, field.id)].filter(Boolean).join('\n'),
        existingRefs: lines(values[bibliographyId] ?? ''),
      })
      const chosen = (data.tipo in KIND_LABELS ? data.tipo : kind) as SampleKind
      const changes: Raw = { kind: chosen }
      for (const [key, value] of Object.entries(data.valores)) {
        changes[RAW_TO_INPUT[key] ?? key] = typeof value === 'number' ? String(value).replace('.', ',') : value
      }
      update(changes)
      setBasis({
        text: data.base,
        references: data.referencias,
        warnings: data.avisos,
        reason: requested === 'auto' ? data.motivo : '',
      })
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
      <p className="calc-intro">
        Não sabe o que colocar? Clique no botão abaixo: a IA escolhe o tipo de cálculo certo para o seu objetivo e busca os
        valores em artigos do PubMed. Depois é só conferir.
      </p>
      <div className="text-review-actions calc-suggest">
        <button type="button" className="primary" onClick={() => suggest('auto')} disabled={loading}>
          {loading ? 'Buscando nos artigos…' : 'Preencher automaticamente (IA + PubMed)'}
        </button>
      </div>
      {loading && <p className="help">A IA está lendo artigos sobre o tema; pode levar até 1 minuto.</p>}
      {error && <p className="suggest-error">{error}</p>}
      {basis && (
        <div className="calc-basis">
          {basis.reason && (
            <p>
              <strong>Tipo escolhido: {KIND_LABELS[kind].toLowerCase()}.</strong> {basis.reason}
            </p>
          )}
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

      <p className="calc-step">1. O que o seu estudo quer medir?</p>
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
      <p className="help">{KIND_HELP[kind]}</p>

      <p className="calc-step">2. Valores esperados</p>
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
            <span className="calc-help">{spec.help}</span>
          </label>
        ))}
      </div>
      <button type="button" className="link calc-link" onClick={() => suggest(kind)} disabled={loading}>
        Buscar na literatura só os valores deste tipo de cálculo
      </button>

      <p className="calc-step">3. Margens do estudo</p>
      <div className="calc-grid">
        {TESTS.includes(kind) ? (
          <>
            <Pills
              label="Nível de significância"
              help="Chance aceita de achar uma diferença que não existe. Use 5% (padrão)."
              options={['5', '1']}
              suffix="%"
              value={raw.alpha}
              onPick={(v) => update({ alpha: v })}
            />
            <Pills
              label="Poder"
              help="Chance de detectar a diferença, se ela existir. Use 80% (padrão) ou 90% para mais segurança."
              options={['80', '90']}
              suffix="%"
              value={raw.power}
              onPick={(v) => update({ power: v })}
            />
          </>
        ) : (
          <Pills
            label="Nível de confiança"
            help="Quão seguro você quer estar do resultado. Use 95% (padrão)."
            options={['95', '99']}
            suffix="%"
            value={raw.confidence}
            onPick={(v) => update({ confidence: v })}
          />
        )}
        <label className="calc-input">
          <span>Perdas e recusas previstas</span>
          <span className="calc-value">
            <input type="text" inputMode="decimal" value={raw.losses ?? ''} onChange={(e) => update({ losses: e.target.value })} />
            <span className="calc-suffix">%</span>
          </span>
          <span className="calc-help">Participantes que podem desistir ou ter dados incompletos. Costuma-se usar 10% a 20%.</span>
        </label>
      </div>

      <p className="calc-step">4. Resultado</p>
      {typeof result === 'string' ? (
        <p className="help">{result}</p>
      ) : (
        <div className="calc-result">
          {result.groups.length > 1 ? (
            <p>
              <strong>{result.groups.map((g) => `${g.final.toLocaleString('pt-BR')} ${inGroup(g.label)}`).join(' e ')}</strong>{' '}
              — total de <strong>{result.totalFinal.toLocaleString('pt-BR')} participantes</strong> (mínimo de{' '}
              {result.total.toLocaleString('pt-BR')} antes das perdas).
            </p>
          ) : (
            <p>
              <strong>{result.totalFinal.toLocaleString('pt-BR')} participantes</strong> (mínimo de{' '}
              {result.total.toLocaleString('pt-BR')} antes das perdas).
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
  help,
  options,
  suffix,
  value,
  onPick,
}: {
  label: string
  help: string
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
      <span className="calc-help">{help}</span>
    </div>
  )
}
