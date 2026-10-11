import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogle } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { APICallError, generateText, RetryError } from 'ai'

export type Task = 'titulos' | 'revisao'

/** Modelos tentados em ordem: se um estiver sobrecarregado ou indisponível, passa para o próximo. */
const MODELS = {
  google: {
    titulos: ['gemini-3.8-flash', 'gemini-3.6-flash'],
    revisao: ['gemini-3.8-flash', 'gemini-3.6-flash'],
  },
  openai: { titulos: ['gpt-5.4-mini', 'gpt-5-mini'], revisao: ['gpt-5.4', 'gpt-5.4-mini'] },
  anthropic: { titulos: ['claude-haiku-4-5', 'claude-sonnet-4-6'], revisao: ['claude-sonnet-5-5', 'claude-sonnet-4-6'] },
} as const

function withOverrideFor(task: Task, ids: readonly string[]): readonly string[] {
  const override = task === 'titulos' ? process.env.TITULO_MODELO : process.env.REVISAO_MODELO
  return override ? [override, ...ids.filter((id) => id !== override)] : ids
}

function pickModels(task: Task) {
  const withOverride = (ids: readonly string[]) => withOverrideFor(task, ids)

  const key = googleKey()
  if (key) {
    const google = createGoogle({ apiKey: key })
    return withOverride(MODELS.google[task]).map((id) => google(id))
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (anthropicKey) {
    const anthropic = createAnthropic({ apiKey: anthropicKey })
    return withOverride(MODELS.anthropic[task]).map((id) => anthropic(id))
  }
  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey) {
    const openai = createOpenAI({ apiKey: openaiKey })
    return withOverride(MODELS.openai[task]).map((id) => openai(id))
  }
  return []
}

export const hasKey = () => pickModels('titulos').length > 0

export class AiFailure extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

type FailureKind = 'chave' | 'cota' | 'outro'

function classify(error: unknown): FailureKind {
  const last = RetryError.isInstance(error) ? error.lastError : error
  if (!APICallError.isInstance(last)) return 'outro'
  if (last.statusCode === 401 || last.statusCode === 403 || /api key/i.test(last.message)) return 'chave'
  if (last.statusCode === 429) return 'cota'
  return 'outro'
}

function friendlyFailure(kind: FailureKind | undefined): AiFailure {
  if (kind === 'chave') {
    return new AiFailure('A chave da IA configurada na Vercel foi recusada. Confira se ela está correta e ativa.', 502)
  }
  if (kind === 'cota') {
    return new AiFailure('A cota da IA acabou por enquanto. No nível gratuito, ela é renovada todos os dias.', 429)
  }
  return new AiFailure('O serviço de IA está sobrecarregado agora. Espere alguns segundos e tente de novo.', 503)
}

/** Modelos cuja cota acabou ficam de fora por um tempo, para não gastar tentativas com eles. */
const QUOTA_PAUSE_MS = 15 * 60 * 1000
const exhaustedUntil = new Map<string, number>()

type Model = ReturnType<typeof pickModels>[number]

/**
 * Tenta os modelos em ordem; erros de chave não passam para o próximo modelo.
 * `pauseOnQuota` é falso para recursos com cota própria (como a busca), que não devem tirar o modelo do uso comum.
 */
async function withFallback<T>(
  all: Model[],
  call: (model: Model, maxRetries: number) => Promise<T>,
  pauseOnQuota = true,
): Promise<T> {
  const available = all.filter((m) => !pauseOnQuota || (exhaustedUntil.get(m.modelId) ?? 0) < Date.now())
  const models = available.length > 0 ? available : all
  let lastKind: FailureKind | undefined
  let quotaHit = false
  for (const [i, model] of models.entries()) {
    try {
      return await call(model, i === models.length - 1 ? 2 : 0)
    } catch (error) {
      lastKind = classify(error)
      console.error(`Falha no modelo ${model.modelId} (${lastKind})`, error)
      if (lastKind === 'chave') break
      if (lastKind === 'cota') {
        quotaHit = true
        if (pauseOnQuota) exhaustedUntil.set(model.modelId, Date.now() + QUOTA_PAUSE_MS)
      }
    }
  }
  throw friendlyFailure(lastKind !== 'chave' && quotaHit ? 'cota' : lastKind)
}

export async function generate(task: Task, system: string, prompt: string): Promise<string> {
  return withFallback(pickModels(task), async (model, maxRetries) => {
    const { text } = await generateText({ model, system, prompt, maxRetries })
    return text
  })
}

const googleKey = () => process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY

/** A busca na internet usa a Pesquisa Google do Gemini; com outros provedores ela não está disponível. */
export const canSearchWeb = () => !!googleKey()

export interface WebSource {
  url: string
  title: string
}

export async function searchWeb(system: string, prompt: string): Promise<{ text: string; sources: WebSource[] }> {
  const google = createGoogle({ apiKey: googleKey() })
  const models = withOverrideFor('revisao', MODELS.google.revisao).map((id) => google(id))
  return withFallback(models, async (model, maxRetries) => {
    const result = await generateText({
      model,
      system,
      prompt,
      maxRetries,
      tools: { google_search: google.tools.googleSearch({}) },
    })
    const sources = result.sources
      .filter((s) => s.sourceType === 'url')
      .map((s) => ({ url: s.url, title: s.title ?? '' }))
    return { text: result.text, sources }
  }, false)
}

export const NO_KEY_MESSAGE = 'Os recursos de IA ainda não estão ativados: falta configurar a chave da IA na Vercel.'

const RATE_WINDOW_MS = 60 * 60 * 1000
const recent = new Map<string, number[]>()

export function isRateLimited(request: Request, limit: number): boolean {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido'
  const now = Date.now()
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  hits.push(now)
  recent.set(ip, hits)
  return hits.length > limit
}

export const clip = (s: unknown, max: number) => (typeof s === 'string' ? s.trim().slice(0, max) : '')

export const errorResponse = (erro: string, status: number) => Response.json({ erro }, { status })

export function failureResponse(error: unknown): Response {
  if (error instanceof AiFailure) return errorResponse(error.message, error.status)
  console.error('Falha inesperada', error)
  return errorResponse('A resposta da IA veio num formato inesperado. Tente de novo.', 502)
}
