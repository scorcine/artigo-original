import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogle } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'

export type Task = 'titulos' | 'revisao'

const DEFAULTS = {
  google: { titulos: 'gemini-3.8-flash', revisao: 'gemini-3.8-flash' },
  openai: { titulos: 'gpt-5.4-mini', revisao: 'gpt-5.4' },
  anthropic: { titulos: 'claude-haiku-4-5', revisao: 'claude-sonnet-5-5' },
} as const

export function pickModel(task: Task) {
  const override = task === 'titulos' ? process.env.TITULO_MODELO : process.env.REVISAO_MODELO
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY
  if (googleKey) return createGoogle({ apiKey: googleKey })(override || DEFAULTS.google[task])
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (anthropicKey) return createAnthropic({ apiKey: anthropicKey })(override || DEFAULTS.anthropic[task])
  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey) return createOpenAI({ apiKey: openaiKey })(override || DEFAULTS.openai[task])
  return null
}

export const NO_KEY_MESSAGE = 'Os recursos de IA ainda não estão ativados: falta configurar a chave da IA na Vercel.'

export const AI_FAILURE_MESSAGE =
  'Não foi possível falar com o serviço de IA. Confira se a chave está correta e se a cota ou o crédito não acabou.'

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
