import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogle } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { APICallError, generateText, RetryError } from 'ai'

export type Task = 'titulos' | 'revisao'

/** Modelos tentados em ordem: se um estiver sobrecarregado ou indisponível, passa para o próximo. */
const MODELS = {
  google: {
    titulos: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-2.5-flash'],
    revisao: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-2.5-flash'],
  },
  openai: { titulos: ['gpt-5.4-mini', 'gpt-5-mini'], revisao: ['gpt-5.4', 'gpt-5.4-mini'] },
  anthropic: { titulos: ['claude-haiku-4-5', 'claude-sonnet-4-6'], revisao: ['claude-sonnet-5-5', 'claude-sonnet-4-6'] },
} as const

function pickModels(task: Task) {
  const override = task === 'titulos' ? process.env.TITULO_MODELO : process.env.REVISAO_MODELO
  const withOverride = (ids: readonly string[]) => (override ? [override, ...ids.filter((id) => id !== override)] : ids)

  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY
  if (googleKey) {
    const google = createGoogle({ apiKey: googleKey })
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

/** Gera texto tentando os modelos em ordem; erros de chave não passam para o próximo modelo. */
export async function generate(task: Task, system: string, prompt: string): Promise<string> {
  let lastKind: FailureKind | undefined
  for (const model of pickModels(task)) {
    try {
      const { text } = await generateText({ model, system, prompt, maxRetries: 1 })
      return text
    } catch (error) {
      lastKind = classify(error)
      console.error(`Falha no modelo ${model.modelId} (${lastKind})`, error)
      if (lastKind === 'chave') break
    }
  }
  throw friendlyFailure(lastKind)
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
