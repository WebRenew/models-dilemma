export interface AIModel {
  id: string
  displayName: string
  name: string
  provider: string
  description?: string
  inputPrice?: number
  outputPrice?: number
}

export const AI_MODELS: AIModel[] = [
  // Anthropic
  {
    id: "anthropic/claude-sonnet-4.5",
    displayName: "Claude Sonnet 4.5",
    name: "Claude Sonnet 4.5",
    provider: "Anthropic",
  },
  {
    id: "anthropic/claude-opus-4.5",
    displayName: "Claude Opus 4.5",
    name: "Claude Opus 4.5",
    provider: "Anthropic",
  },

  // OpenAI
  {
    id: "openai/gpt-5.1-thinking",
    displayName: "GPT-5.1 Thinking",
    name: "GPT-5.1 Thinking",
    provider: "OpenAI",
  },

  // xAI
  {
    id: "xai/grok-4.1-fast-reasoning",
    displayName: "Grok 4.1 Fast Reasoning",
    name: "Grok 4.1 Fast Reasoning",
    provider: "xAI",
  },

  // Google
  {
    id: "google/gemini-3-pro-preview",
    displayName: "Gemini 3 Pro Preview",
    name: "Gemini 3 Pro Preview",
    provider: "Google",
  },

  // Perplexity
  {
    id: "perplexity/sonar-pro",
    displayName: "Sonar Pro",
    name: "Sonar Pro",
    provider: "Perplexity",
  },

  // Moonshot
  {
    id: "moonshotai/kimi-k2-thinking-turbo",
    displayName: "Kimi K2 Thinking Turbo",
    name: "Kimi K2 Thinking Turbo",
    provider: "Moonshot",
  },

  // DeepSeek
  {
    id: "deepseek/deepseek-v3.2-thinking",
    displayName: "DeepSeek V3.2 Thinking",
    name: "DeepSeek V3.2 Thinking",
    provider: "DeepSeek",
  },
]

export const MODELS = AI_MODELS

export const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5"

export const MODEL_COUNT = AI_MODELS.length

export function getRandomModel(models: AIModel[] = AI_MODELS, excludeId?: string): string {
  const available = excludeId ? models.filter((m) => m.id !== excludeId) : models

  if (available.length === 0) {
    return DEFAULT_MODEL
  }

  const randomIndex = Math.floor(Math.random() * available.length)
  return available[randomIndex].id
}
