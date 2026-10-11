import { useState } from 'react'
import { STEPS, visibleFields } from './data/steps'
import type { Phase, StudyType, Values } from './data/types'
import { analyzeProject, type Analysis } from './lib/ia'
import { lines } from './lib/manuscript'

/** Campos que não são texto corrido: dados de contato, listas de referências, tabelas e valores. */
const SKIP = new Set([
  'pb_bibliografia',
  'fin_referencias',
  'pb_orcamento',
  'tcle_contato_pesquisador',
  'tcle_contato_cep',
  'autores',
  'afiliacoes',
  'correspondente',
  'fin_agradecimentos',
  'fin_contribuicoes',
])

const MIN_TEXT_FIELD = 30

const LEVELS: Record<Analysis['similaridade']['nivel'], { label: string; text: string }> = {
  baixo: { label: 'Baixo', text: 'Poucos ou nenhum trecho muito parecido com os artigos citados.' },
  moderado: { label: 'Moderado', text: 'Há trechos parecidos demais com os artigos citados: reescreva os apontados abaixo.' },
  alto: { label: 'Alto', text: 'Boa parte do texto segue de perto os artigos citados: reescreva os trechos antes de submeter.' },
  indisponivel: {
    label: 'Não verificado',
    text: 'Nenhuma referência com DOI foi encontrada no PubMed para comparar. Use referências com DOI ou um verificador externo.',
  },
  erro: { label: 'Não verificado', text: 'A comparação com os artigos falhou desta vez. Tente analisar de novo.' },
}

interface Part {
  id: string
  titulo: string
  texto: string
}

function projectParts(phase: Phase, type: StudyType | null, values: Values): Part[] {
  const parts: Part[] = []
  for (const step of STEPS.filter((s) => s.phase === phase)) {
    for (const field of visibleFields(step.id, type, values)) {
      const text = (values[field.id] ?? '').trim()
      if (!text || SKIP.has(field.id) || field.schedule || field.kind === 'check' || field.kind === 'choice') continue
      if (field.kind === 'text' && text.length < MIN_TEXT_FIELD) continue
      parts.push({ id: field.id, titulo: `${step.title} › ${field.label}`, texto: text })
    }
  }
  return parts
}

const scoreClass = (n: number) => (n >= 8 ? 'good' : n >= 6 ? 'fair' : 'poor')

export function ProjectAnalysis({
  phase,
  type,
  values,
  onChange,
}: {
  phase: Phase
  type: StudyType | null
  values: Values
  onChange: (id: string, value: string) => void
}) {
  const storeId = `analise_fase${phase}`
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const saved = values[storeId]
  let analysis: (Analysis & { data: string }) | null = null
  try {
    analysis = saved ? JSON.parse(saved) : null
  } catch {
    analysis = null
  }

  const parts = projectParts(phase, type, values)
  const titles = new Map(parts.map((p) => [p.id, p.titulo]))
  const what = phase === 1 ? 'projeto' : 'artigo'

  const run = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await analyzeProject({
        fase: phase,
        studyType: type?.name,
        guideline: type?.guideline,
        partes: parts,
        referencias: lines(values[phase === 1 ? 'pb_bibliografia' : 'fin_referencias'] ?? ''),
      })
      onChange(storeId, JSON.stringify({ ...result, data: new Date().toLocaleString('pt-BR') }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível analisar agora.')
    } finally {
      setLoading(false)
    }
  }

  const fix = (campo: string, from: string, to: string) => {
    const current = values[campo] ?? ''
    if (current.includes(from)) onChange(campo, current.replace(from, to))
  }

  const fixButton = ({ campo, trecho, sugestao }: { campo: string; trecho: string; sugestao: string }) => {
    const current = values[campo] ?? ''
    if (current.includes(trecho)) {
      return (
        <button type="button" onClick={() => fix(campo, trecho, sugestao)}>
          Aplicar no texto
        </button>
      )
    }
    if (current.includes(sugestao)) {
      return (
        <span className="analysis-applied">
          Aplicada.{' '}
          <button type="button" className="link" onClick={() => fix(campo, sugestao, trecho)}>
            Desfazer
          </button>
        </span>
      )
    }
    return <span className="help">O trecho já foi alterado no texto.</span>
  }

  return (
    <section className="analysis">
      <h3>Análise do {what} completo</h3>
      <p className="help">
        A IA lê todo o {what} e avalia a qualidade do texto, aponta correções e compara o texto com os resumos dos artigos
        citados (buscados no PubMed pelo DOI) para encontrar trechos copiados, traduzidos ao pé da letra ou parafraseados de
        perto. Leva de 1 a 2 minutos.
      </p>
      <div className="text-review-actions">
        <button type="button" className="suggest strong" onClick={run} disabled={loading || parts.length === 0}>
          {loading ? 'Analisando…' : analysis ? 'Analisar de novo' : `Analisar o ${what} completo`}
        </button>
        {analysis && !loading && <span className="help">Última análise: {analysis.data}</span>}
      </div>
      {parts.length === 0 && <p className="help">Preencha o {what} antes de pedir a análise.</p>}
      {loading && <p className="help">Lendo o {what} e comparando com os artigos citados…</p>}
      {error && <p className="suggest-error">{error}</p>}

      {analysis && (
        <>
          <div className="analysis-summary">
            <div className={`analysis-score ${scoreClass(analysis.qualidade.nota)}`}>
              <span className="analysis-big">{analysis.qualidade.nota.toLocaleString('pt-BR')}</span>
              <span>Qualidade do texto (0 a 10)</span>
            </div>
            <div className={`analysis-score level-${analysis.similaridade.nivel}`}>
              <span className="analysis-big">{LEVELS[analysis.similaridade.nivel].label}</span>
              <span>
                Similaridade com os artigos citados
                {analysis.similaridade.fontesComparadas > 0 &&
                  ` (cerca de ${analysis.similaridade.percentual.toLocaleString('pt-BR')}% do texto)`}
              </span>
            </div>
          </div>

          <h4>Qualidade do texto</h4>
          <ul className="analysis-criteria">
            {analysis.qualidade.criterios.map((c) => (
              <li key={c.nome}>
                <span className={`analysis-pill ${scoreClass(c.nota)}`}>{c.nota.toLocaleString('pt-BR')}</span>
                <span>
                  <strong>{c.nome}.</strong> {c.comentario}
                </span>
              </li>
            ))}
          </ul>
          {analysis.qualidade.pontosFortes.length > 0 && (
            <>
              <p className="review-heading">Pontos fortes</p>
              <ul className="analysis-strengths">
                {analysis.qualidade.pontosFortes.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </>
          )}

          <h4>Correções sugeridas ({analysis.qualidade.correcoes.length})</h4>
          {analysis.qualidade.correcoes.length === 0 && <p className="help">Nenhuma correção importante encontrada.</p>}
          {analysis.qualidade.correcoes.map((c, i) => (
            <div key={i} className="analysis-item">
              <p className="analysis-where">{titles.get(c.campo) ?? c.campo}</p>
              <p>
                <strong>Problema:</strong> {c.problema}
              </p>
              <p className="analysis-old">{c.trecho}</p>
              <p className="analysis-new">{c.sugestao}</p>
              {fixButton(c)}
            </div>
          ))}

          <h4>Similaridade e plágio</h4>
          <p className="help">
            {LEVELS[analysis.similaridade.nivel].text} Foram comparados {analysis.similaridade.fontesComparadas} de{' '}
            {analysis.similaridade.referencias} referências.
          </p>
          {analysis.similaridade.trechos.map((t, i) => (
            <div key={i} className="analysis-item">
              <p className="analysis-where">
                {titles.get(t.campo) ?? t.campo} · {t.tipo}
              </p>
              <p className="analysis-old">{t.trecho}</p>
              {t.fonte && <p className="help">Parecido com: {t.fonte}</p>}
              <p className="analysis-new">{t.sugestao}</p>
              {fixButton(t)}
            </div>
          ))}
          <div className="notice warning">
            Esta verificação compara o texto apenas com os resumos dos artigos citados. Para comparar com a internet, faça
            também a verificação no CopySpider, logo abaixo.
          </div>
        </>
      )}

      <CopySpider phase={phase} parts={parts} values={values} onChange={onChange} />
    </section>
  )
}

const COPYSPIDER_LEVELS = ['Baixa', 'Moderada', 'Alta']

function CopySpider({
  phase,
  parts,
  values,
  onChange,
}: {
  phase: Phase
  parts: Part[]
  values: Values
  onChange: (id: string, value: string) => void
}) {
  const storeId = `copyspider_fase${phase}`
  let record: { nivel?: string; indice?: string; data?: string } = {}
  try {
    record = JSON.parse(values[storeId] ?? '{}')
  } catch {
    record = {}
  }
  const save = (change: typeof record) =>
    onChange(storeId, JSON.stringify({ ...record, ...change, data: new Date().toLocaleDateString('pt-BR') }))

  const downloadText = () => {
    const text = parts.map((p) => `${p.titulo.split(' › ').pop()}\n\n${p.texto}`).join('\n\n\n')
    const url = URL.createObjectURL(new Blob(['\ufeff', text], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = phase === 1 ? 'projeto-para-copyspider.txt' : 'artigo-para-copyspider.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="copyspider">
      <h4>Verificação na internet com o CopySpider</h4>
      <p className="help">
        O CopySpider é um programa gratuito, instalado no computador, que compara o texto com documentos da
        internet. Ele não pode ser aberto dentro do site, mas o arquivo para ele sai daqui, e o resultado fica registrado aqui.
      </p>
      <ol className="copyspider-steps">
        <li>
          <button type="button" className="suggest" onClick={downloadText} disabled={parts.length === 0}>
            Baixar o texto para o CopySpider (.txt)
          </button>{' '}
          <span className="help">Só o texto, sem a lista de referências, que o programa contaria como semelhança.</span>
        </li>
        <li>
          Se ainda não tem o programa,{' '}
          <a href="https://copyspider.com.br/main/" target="_blank" rel="noreferrer">
            baixe o CopySpider
          </a>{' '}
          e cadastre seu e-mail no site dele.
        </li>
        <li>
          Abra o programa, informe o e-mail, escolha o modo <strong>Busca em arquivos da internet</strong>, clique em{' '}
          <strong>Ad. arquivo</strong>, selecione o arquivo baixado e clique em <strong>Iniciar</strong>.
        </li>
        <li>
          Ao terminar, abra o relatório. Trechos marcados que sejam citações com referência estão corretos; reescreva os que
          forem cópia sem citação (a análise acima ajuda a reescrever).
        </li>
        <li>Registre o resultado:</li>
      </ol>
      <div className="copyspider-result">
        <div className="calc-input">
          <span>Semelhança indicada pelo CopySpider</span>
          <div className="choices small">
            {COPYSPIDER_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                className={`choice${record.nivel === level ? ' selected' : ''}`}
                onClick={() => save({ nivel: level })}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
        <label className="calc-input">
          <span>Índice de similaridade (Si)</span>
          <span className="calc-value">
            <input type="text" inputMode="decimal" value={record.indice ?? ''} onChange={(e) => save({ indice: e.target.value })} />
            <span className="calc-suffix">%</span>
          </span>
        </label>
      </div>
      {record.nivel && (
        <p className={`copyspider-verdict ${record.nivel.toLowerCase()}`}>
          {record.nivel === 'Baixa'
            ? 'Semelhança baixa (menos de 10%): em geral, sem problemas. Confira mesmo assim os trechos agrupados.'
            : record.nivel === 'Moderada'
              ? 'Semelhança moderada (10% a 30%): veja no relatório se os trechos são citações com referência; reescreva os que não forem.'
              : 'Semelhança alta (30% ou mais): reescreva os trechos apontados antes de submeter e rode a verificação de novo.'}
          {record.data && ` Registrado em ${record.data}.`}
        </p>
      )}
    </div>
  )
}
