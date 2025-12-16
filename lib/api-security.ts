/**
 * API Security: Rate limiting and model validation
 * Protects against credit burning and data pollution attacks
 */

import { AI_MODELS } from "@/lib/models"

// In-memory rate limiter (resets on deploy, but sufficient for abuse prevention)
// For production scale, use Redis/Upstash
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const MAX_REQUESTS_PER_WINDOW = 50 // 50 games per hour per IP

// Valid model IDs from our allowlist
const VALID_MODEL_IDS = new Set(AI_MODELS.map((m) => m.id))

/**
 * Extract client IP from request headers
 */
export function getClientIP(request: Request): string {
  // Vercel/Cloudflare headers
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0].trim()
  }
  
  const realIP = request.headers.get("x-real-ip")
  if (realIP) {
    return realIP
  }
  
  // Fallback for development
  return "127.0.0.1"
}

/**
 * Check if request is within rate limit
 * Returns { allowed: boolean, remaining: number, resetIn: number }
 */
export function checkRateLimit(ip: string): {
  allowed: boolean
  remaining: number
  resetIn: number
} {
  const now = Date.now()
  const record = rateLimitStore.get(ip)
  
  // Clean up expired entries periodically (every 100 checks)
  if (Math.random() < 0.01) {
    for (const [key, value] of rateLimitStore.entries()) {
      if (now > value.resetAt) {
        rateLimitStore.delete(key)
      }
    }
  }
  
  if (!record || now > record.resetAt) {
    // New window
    rateLimitStore.set(ip, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    })
    return {
      allowed: true,
      remaining: MAX_REQUESTS_PER_WINDOW - 1,
      resetIn: RATE_LIMIT_WINDOW_MS,
    }
  }
  
  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: record.resetAt - now,
    }
  }
  
  record.count++
  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_WINDOW - record.count,
    resetIn: record.resetAt - now,
  }
}

/**
 * Validate that a model ID is in our allowlist
 */
export function isValidModelId(modelId: string): boolean {
  return VALID_MODEL_IDS.has(modelId)
}

/**
 * Get list of valid model IDs (for error messages)
 */
export function getValidModelIds(): string[] {
  return Array.from(VALID_MODEL_IDS)
}

/**
 * Create rate limit error response with proper headers
 */
export function rateLimitResponse(resetIn: number): Response {
  const resetInSeconds = Math.ceil(resetIn / 1000)
  const resetInMinutes = Math.ceil(resetInSeconds / 60)
  
  return new Response(
    JSON.stringify({
      error: "Rate limit exceeded",
      message: `Maximum ${MAX_REQUESTS_PER_WINDOW} games per hour. Try again in ${resetInMinutes} minutes.`,
      retryAfter: resetInSeconds,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(resetInSeconds),
        "X-RateLimit-Limit": String(MAX_REQUESTS_PER_WINDOW),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil((Date.now() + resetIn) / 1000)),
      },
    }
  )
}

/**
 * Create invalid model error response
 */
export function invalidModelResponse(modelId: string): Response {
  return new Response(
    JSON.stringify({
      error: "Invalid model",
      message: `Model "${modelId}" is not in the allowed list. Use a model from the AI_MODELS registry.`,
    }),
    {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }
  )
}

/**
 * Add rate limit headers to a response
 */
export function addRateLimitHeaders(
  response: Response,
  remaining: number,
  resetIn: number
): Response {
  const headers = new Headers(response.headers)
  headers.set("X-RateLimit-Limit", String(MAX_REQUESTS_PER_WINDOW))
  headers.set("X-RateLimit-Remaining", String(remaining))
  headers.set("X-RateLimit-Reset", String(Math.ceil((Date.now() + resetIn) / 1000)))
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

