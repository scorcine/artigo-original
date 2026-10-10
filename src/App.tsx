import { useEffect, useMemo, useState } from 'react'
import { STUDY_TYPES, getStudyType } from './data/studyTypes'
import { STEPS, getStepFields, isFilled, stepProgress } from './data/steps'
import type { Field, StudyType } from './data/types'
import { buildManuscript, countWords, lines, toHtmlDocument, toMarkdown } from './lib/manuscript'
import { emptyDraft, loadDraft, saveDraft, type Draft } from './lib/storage'

export default function App() {
  const [draft, setDraft] = useState<Draft>(loadDraft)

  useEffect(() => {
    saveDraft(draft)
  }, [draft])

  const type = getStudyType(draft.typeId)
  const stepIndex = type ? Math.min(Math.max(draft.stepIndex, 0), STEPS.length - 1) : 0
  const step = STEPS[stepIndex]

  const goTo = (index: number) => {
    setDraft((d) => ({ ...d, stepIndex: index }))
    window.scrollTo({ top: 0 })
  }

  const setValue = (id: string, value: string) =>
    setDraft((d) => ({ ...d, values: { ...d.values, [id]: value } }))

  const chooseType = (typeId: string) => setDraft((d) => ({ ...d, typeId }))

  const reset = () => {
    if (window.confirm('Apagar o rascunho atual e começar um novo artigo? Esta ação não pode ser desfeita.')) {
      setDraft(emptyDraft())
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Artigo Original</h1>
          <p>Construa seu artigo científico passo a passo. O rascunho fica salvo apenas neste navegador.</p>
        </div>
        {type && <span className="type-badge">{type.name}</span>}
      </header>

      <div className="layout">
        <nav className="steps" aria-label="Etapas do artigo">
          <ol>
            {STEPS.map((s, i) => {
              const { done, total } = stepProgress(s.id, type, draft.values)
              const disabled = !type && i > 0
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={i === stepIndex ? 'active' : ''}
                    disabled={disabled}
                    onClick={() => goTo(i)}
                  >
                    <span className="step-number">{i + 1}</span>
                    <span className="step-title">{s.title}</span>
                    {total > 0 && (
                      <span className={`step-count${done === total ? ' complete' : ''}`}>
                        {done}/{total}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        <main className="content">
          <p className="step-kicker">
            Etapa {stepIndex + 1} de {STEPS.length}
          </p>
          <h2>{step.title}</h2>
          <p className="step-intro">{step.intro}</p>

          {step.id === 'tipo' && <TypePicker selected={draft.typeId} onChoose={chooseType} />}

          {step.id === 'metodos' && type && (
            <div className="notice">
              Para <strong>{type.name.toLowerCase()}</strong>, a referência de relato é: {type.guideline}. As listas
              completas estão na{' '}
              <a href="https://www.equator-network.org/" target="_blank" rel="noreferrer">
                rede EQUATOR
              </a>
              .
            </div>
          )}

          {step.id !== 'tipo' && step.id !== 'revisao' && (
            <div className="fields">
              {getStepFields(step.id, type).map((field) => (
                <FieldInput key={field.id} field={field} value={draft.values[field.id] ?? ''} onChange={setValue} />
              ))}
            </div>
          )}

          {step.id === 'revisao' && <Review type={type} values={draft.values} onGoTo={goTo} onReset={reset} />}

          <div className="pager">
            <button type="button" className="secondary" disabled={stepIndex === 0} onClick={() => goTo(stepIndex - 1)}>
              Voltar
            </button>
            {stepIndex < STEPS.length - 1 && (
              <button type="button" disabled={!type} onClick={() => goTo(stepIndex + 1)}>
                Avançar
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

function TypePicker({ selected, onChoose }: { selected: string | null; onChoose: (id: string) => void }) {
  return (
    <div className="type-grid" role="radiogroup" aria-label="Tipo de estudo">
      {STUDY_TYPES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={selected === t.id}
          className={`type-card${selected === t.id ? ' selected' : ''}`}
          onClick={() => onChoose(t.id)}
        >
          <span className="type-name">{t.name}</span>
          <span className="type-desc">{t.description}</span>
          <span className="type-guideline">Relato: {t.guideline}</span>
        </button>
      ))}
    </div>
  )
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field
  value: string
  onChange: (id: string, value: string) => void
}) {
  const inputId = `campo-${field.id}`
  return (
    <div className="field">
      <label htmlFor={inputId}>
        {field.label}
        {field.optional && <span className="optional">opcional</span>}
      </label>
      {field.help && <p className="help">{field.help}</p>}
      {field.example && (
        <details className="example">
          <summary>Ver exemplo</summary>
          <p>{field.example}</p>
        </details>
      )}
      {field.singleLine ? (
        <input id={inputId} type="text" value={value} onChange={(e) => onChange(field.id, e.target.value)} />
      ) : (
        <textarea
          id={inputId}
          rows={field.rows ?? 4}
          value={value}
          onChange={(e) => onChange(field.id, e.target.value)}
        />
      )}
    </div>
  )
}

function slugify(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return slug || 'artigo-original'
}

function download(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob(['\ufeff', content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function Review({
  type,
  values,
  onGoTo,
  onReset,
}: {
  type: StudyType | null
  values: Record<string, string>
  onGoTo: (index: number) => void
  onReset: () => void
}) {
  const [copied, setCopied] = useState(false)
  const manuscript = useMemo(() => buildManuscript(type, values), [type, values])
  const words = countWords(manuscript)
  const name = slugify(manuscript.title)

  const missing = STEPS.map((s, index) => ({
    step: s,
    index,
    fields: getStepFields(s.id, type).filter((f) => !f.optional && !isFilled(values, f.id)),
  })).filter((m) => m.fields.length > 0)

  const copy = async () => {
    await navigator.clipboard.writeText(toMarkdown(manuscript))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="review">
      <div className="stats">
        <span>
          <strong>{words.toLocaleString('pt-BR')}</strong> palavras
        </span>
        {type?.wordLimit && (
          <span className={words > type.wordLimit.max ? 'over' : ''}>{type.wordLimit.note}</span>
        )}
      </div>

      {missing.length > 0 ? (
        <div className="missing">
          <h3>Ainda falta preencher</h3>
          <ul>
            {missing.map((m) => (
              <li key={m.step.id}>
                <button type="button" className="link" onClick={() => onGoTo(m.index)}>
                  {m.step.title}
                </button>
                : {m.fields.map((f) => f.label).join(', ')}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="notice success">Todas as partes obrigatórias estão preenchidas.</div>
      )}

      <div className="actions">
        <button type="button" onClick={() => download(`${name}.doc`, toHtmlDocument(manuscript), 'application/msword')}>
          Baixar para o Word (.doc)
        </button>
        <button type="button" className="secondary" onClick={() => download(`${name}.md`, toMarkdown(manuscript), 'text/markdown')}>
          Baixar texto (.md)
        </button>
        <button type="button" className="secondary" onClick={copy}>
          {copied ? 'Copiado' : 'Copiar texto'}
        </button>
        <button type="button" className="danger" onClick={onReset}>
          Começar novo artigo
        </button>
      </div>

      <article className="manuscript">
        <h1>{manuscript.title || 'Sem título'}</h1>
        {manuscript.front.map((b, i) => (
          <BlockView key={i} block={b} />
        ))}
        {manuscript.sections.map((s) => (
          <section key={s.title}>
            <h2>{s.title}</h2>
            {s.blocks.map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </section>
        ))}
      </article>
    </div>
  )
}

function BlockView({ block }: { block: { heading?: string; label?: string; text: string } }) {
  return (
    <>
      {block.heading && <h3>{block.heading}</h3>}
      {lines(block.text).map((l, i) => (
        <p key={i}>
          {i === 0 && block.label && <strong>{block.label}: </strong>}
          {l}
        </p>
      ))}
    </>
  )
}
