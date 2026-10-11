export type SampleKind = 'duas-proporcoes' | 'prevalencia' | 'duas-medias' | 'diagnostico'

/** Valores digitados no formulário (percentuais em %, como o pesquisador escreve). */
export interface SampleInput {
  kind: SampleKind
  alpha: number
  power: number
  confidence: number
  losses: number
  ratio: number
  group1: string
  group2: string
  p1: number
  p2: number
  p: number
  precision: number
  population: number
  meanDiff: number
  sd: number
  unit: string
  sensitivity: number
  specificity: number
  prevalence: number
}

export const DEFAULT_INPUT: SampleInput = {
  kind: 'duas-proporcoes',
  alpha: 5,
  power: 80,
  confidence: 95,
  losses: 10,
  ratio: 1,
  group1: 'Grupo 1',
  group2: 'Grupo 2',
  p1: NaN,
  p2: NaN,
  p: NaN,
  precision: 5,
  population: NaN,
  meanDiff: NaN,
  sd: NaN,
  unit: '',
  sensitivity: NaN,
  specificity: NaN,
  prevalence: NaN,
}

export const KIND_LABELS: Record<SampleKind, string> = {
  'duas-proporcoes': 'Comparar duas proporções (dois grupos)',
  prevalencia: 'Estimar uma prevalência (um grupo)',
  'duas-medias': 'Comparar duas médias (dois grupos)',
  diagnostico: 'Acurácia diagnóstica (sensibilidade e especificidade)',
}

/** Inversa da distribuição normal padrão (algoritmo de Acklam, erro < 1e-9). */
export function normalQuantile(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const low = 0.02425
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - low) return -normalQuantile(1 - p)
  const q = p - 0.5
  const r = q * q
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  )
}

export interface SampleResult {
  /** Tamanho mínimo por grupo (ou único grupo), antes das perdas. */
  groups: { label: string; n: number; final: number }[]
  total: number
  totalFinal: number
}

const pct = (v: number) => v / 100
const valid = (...values: number[]) => values.every((v) => Number.isFinite(v))
const withLosses = (n: number, losses: number) => Math.ceil(n / (1 - pct(losses)))

/** Calcula o tamanho amostral; devolve uma mensagem quando falta ou sobra algum valor. */
export function computeSample(i: SampleInput): SampleResult | string {
  if (!valid(i.losses) || i.losses < 0 || i.losses >= 90) return 'Informe o percentual de perdas (entre 0 e 89%).'
  const zAlpha = normalQuantile(1 - pct(i.alpha) / 2)
  const zBeta = normalQuantile(pct(i.power))
  const zConf = normalQuantile(1 - (1 - pct(i.confidence)) / 2)
  const k = i.ratio > 0 ? i.ratio : 1

  const twoGroups = (n1: number): SampleResult => {
    const a = Math.ceil(n1)
    const b = Math.ceil(n1 * k)
    const groups = [
      { label: i.group1 || 'Grupo 1', n: a, final: withLosses(a, i.losses) },
      { label: i.group2 || 'Grupo 2', n: b, final: withLosses(b, i.losses) },
    ]
    return { groups, total: a + b, totalFinal: groups[0].final + groups[1].final }
  }
  const oneGroup = (n: number): SampleResult => {
    const a = Math.ceil(n)
    return { groups: [{ label: 'Amostra', n: a, final: withLosses(a, i.losses) }], total: a, totalFinal: withLosses(a, i.losses) }
  }

  switch (i.kind) {
    case 'duas-proporcoes': {
      if (!valid(i.p1, i.p2)) return 'Informe a proporção esperada do desfecho em cada grupo.'
      const p1 = pct(i.p1)
      const p2 = pct(i.p2)
      if (p1 <= 0 || p1 >= 1 || p2 <= 0 || p2 >= 1) return 'As proporções devem estar entre 0% e 100%.'
      if (p1 === p2) return 'As proporções dos dois grupos precisam ser diferentes.'
      const pBar = (p1 + k * p2) / (1 + k)
      const delta = Math.abs(p1 - p2)
      const n = (zAlpha * Math.sqrt((1 + 1 / k) * pBar * (1 - pBar)) + zBeta * Math.sqrt(p1 * (1 - p1) + (p2 * (1 - p2)) / k)) ** 2 / delta ** 2
      const corrected = (n / 4) * (1 + Math.sqrt(1 + (2 * (1 + k)) / (n * k * delta))) ** 2
      return twoGroups(corrected)
    }
    case 'prevalencia': {
      if (!valid(i.p, i.precision)) return 'Informe a prevalência esperada e a precisão desejada.'
      const p = pct(i.p)
      const d = pct(i.precision)
      if (p <= 0 || p >= 1) return 'A prevalência esperada deve estar entre 0% e 100%.'
      if (d <= 0 || d >= 0.5) return 'A precisão deve estar entre 0 e 50 pontos percentuais.'
      let n = (zConf ** 2 * p * (1 - p)) / d ** 2
      if (valid(i.population) && i.population > 0) n = n / (1 + (n - 1) / i.population)
      return oneGroup(n)
    }
    case 'duas-medias': {
      if (!valid(i.meanDiff, i.sd)) return 'Informe a diferença mínima entre as médias e o desvio padrão.'
      if (i.meanDiff <= 0 || i.sd <= 0) return 'A diferença e o desvio padrão devem ser maiores que zero.'
      return twoGroups(((1 + 1 / k) * i.sd ** 2 * (zAlpha + zBeta) ** 2) / i.meanDiff ** 2)
    }
    case 'diagnostico': {
      if (!valid(i.sensitivity, i.specificity, i.prevalence, i.precision)) {
        return 'Informe a sensibilidade, a especificidade, a prevalência e a precisão desejada.'
      }
      const se = pct(i.sensitivity)
      const sp = pct(i.specificity)
      const prev = pct(i.prevalence)
      const d = pct(i.precision)
      if ([se, sp, prev].some((v) => v <= 0 || v >= 1)) return 'Os percentuais devem estar entre 0% e 100%.'
      if (d <= 0 || d >= 0.5) return 'A precisão deve estar entre 0 e 50 pontos percentuais.'
      const nSe = (zConf ** 2 * se * (1 - se)) / d ** 2 / prev
      const nSp = (zConf ** 2 * sp * (1 - sp)) / d ** 2 / (1 - prev)
      return oneGroup(Math.max(nSe, nSp))
    }
  }
}

const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const percent = (v: number) => `${num(v)}%`
const int = (v: number) => v.toLocaleString('pt-BR')

/** "no grupo controle", mas "no Grupo 1" quando o nome já começa com "grupo". */
export const inGroup = (label: string) => (/^grupo\b/i.test(label) ? `no ${label}` : `no grupo ${label}`)

/** Parágrafo pronto para o projeto/artigo, com os valores usados e o resultado. */
export function describeSample(i: SampleInput, r: SampleResult, basis: string): string {
  const test = `nível de significância bicaudal de ${percent(i.alpha)} e poder estatístico de ${percent(i.power)}`
  const allocation = i.ratio === 1 ? 'alocação 1:1' : `razão de alocação 1:${num(i.ratio)}`
  const lossText = (n: number, final: number) =>
    i.losses > 0
      ? `Acrescentando ${percent(i.losses)} para possíveis perdas e recusas, a amostra final será de ${int(final)}`
      : `A amostra final será de ${int(n)}`

  let text: string
  if (i.kind === 'duas-proporcoes' || i.kind === 'duas-medias') {
    const [g1, g2] = r.groups
    const method =
      i.kind === 'duas-proporcoes'
        ? `para comparação de duas proporções independentes (método de Fleiss com correção de continuidade), considerando ${test}, ${allocation} e proporções esperadas do desfecho de ${percent(i.p1)} ${inGroup(g1.label)} e de ${percent(i.p2)} ${inGroup(g2.label)}`
        : `para comparação de duas médias independentes, considerando ${test}, ${allocation}, diferença mínima clinicamente relevante de ${num(i.meanDiff)}${i.unit ? ` ${i.unit}` : ''} entre os grupos e desvio padrão de ${num(i.sd)}${i.unit ? ` ${i.unit}` : ''}`
    const perGroup = g1.n === g2.n ? `${int(g1.n)} participantes por grupo` : `${int(g1.n)} participantes ${inGroup(g1.label)} e ${int(g2.n)} ${inGroup(g2.label)}`
    const finalGroups =
      g1.final === g2.final ? `${int(g1.final)} participantes por grupo` : `${int(g1.final)} participantes ${inGroup(g1.label)} e ${int(g2.final)} ${inGroup(g2.label)}`
    const closing =
      i.losses > 0
        ? `Acrescentando ${percent(i.losses)} para possíveis perdas e recusas, a amostra final será de ${finalGroups}, totalizando ${int(r.totalFinal)} participantes.`
        : ''
    text = `O tamanho amostral foi calculado ${method}. O cálculo indicou a necessidade de ${perGroup} (${int(r.total)} no total).${closing ? ` ${closing}` : ''}`
  } else if (i.kind === 'prevalencia') {
    const finite = valid(i.population) && i.population > 0 ? `, com correção para população finita de ${i.population.toLocaleString('pt-BR')} indivíduos` : ''
    text = `O tamanho amostral foi calculado para estimar uma proporção, considerando prevalência esperada de ${percent(i.p)}, nível de confiança de ${percent(i.confidence)} e precisão absoluta de ${num(i.precision)} pontos percentuais${finite}. O cálculo indicou a necessidade de ${int(r.total)} participantes. ${lossText(r.total, r.totalFinal)} participantes.`
  } else {
    text = `O tamanho amostral foi calculado pelo método de Buderer para estudos de acurácia diagnóstica, considerando sensibilidade esperada de ${percent(i.sensitivity)}, especificidade esperada de ${percent(i.specificity)}, prevalência da condição de ${percent(i.prevalence)} na população estudada, nível de confiança de ${percent(i.confidence)} e precisão de ${num(i.precision)} pontos percentuais. O cálculo indicou a necessidade de ${int(r.total)} participantes. ${lossText(r.total, r.totalFinal)} participantes.`
  }
  return basis.trim() ? `${text} ${basis.trim()}` : text
}
