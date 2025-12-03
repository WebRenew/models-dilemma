"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// Model colors based on the provided design system
const MODEL_COLORS: Record<string, string> = {
  "anthropic/claude-sonnet-4.5": "oklch(57.61% .2321 258.23)", // blue
  "anthropic/claude-opus-4.5": "oklch(55.5% .2186 306.12)", // purple
  "openai/gpt-5.1-thinking": "oklch(64.58% .199 147.27)", // green
  "xai/grok-4.1-fast-reasoning": "oklch(62.56% .2234 23.03)", // red
  "google/gemini-3-pro-preview": "oklch(81.87% .1969 76.46)", // amber
  "perplexity/sonar-pro": "oklch(64.92% .1403 181.95)", // teal
  "moonshotai/kimi-k2-thinking-turbo": "oklch(63.52% .2346 1.01)", // pink
  "deepseek/deepseek-v3.2-thinking": "hsla(0,0%,63%,1)", // gray
}

function getModelColor(modelId: string): string {
  return MODEL_COLORS[modelId] || "oklch(50% 0 0)"
}

function formatModelName(modelId: string): string {
  return modelId
    .replace(/^[^/]+\//, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

interface ModelStats {
  modelId: string
  displayName: string
  cooperations: number
  defections: number
  totalMoves: number
  overtCooperations: number
  overtDefections: number
  overtTotalMoves: number
  cloakedCooperations: number
  cloakedDefections: number
  cloakedTotalMoves: number
  wins: number
  losses: number
  ties: number
  gamesPlayed: number
  salesCooperations: number
  salesDefections: number
  researchCooperations: number
  researchDefections: number
  creatorCooperations: number
  creatorDefections: number
  errors: number
  tokensIn: number
  tokensOut: number
}

export default function ModelExplorerPage() {
  const [models, setModels] = useState<ModelStats[]>([])
  const [loading, setLoading] = useState(true)
  const [behaviorFilter, setBehaviorFilter] = useState<"all" | "overt" | "cloaked">("all")

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/model-stats")
        const data = await res.json()
        setModels(data.models || [])
      } catch (err) {
        console.error("Failed to fetch model stats:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  const behaviorData = models.map((m) => {
    if (behaviorFilter === "overt") {
      return {
        name: formatModelName(m.modelId),
        modelId: m.modelId,
        cooperations: m.overtCooperations,
        defections: m.overtDefections,
        cooperationRate: m.overtTotalMoves > 0 ? Math.round((m.overtCooperations / m.overtTotalMoves) * 100) : 0,
      }
    } else if (behaviorFilter === "cloaked") {
      return {
        name: formatModelName(m.modelId),
        modelId: m.modelId,
        cooperations: m.cloakedCooperations,
        defections: m.cloakedDefections,
        cooperationRate: m.cloakedTotalMoves > 0 ? Math.round((m.cloakedCooperations / m.cloakedTotalMoves) * 100) : 0,
      }
    }
    return {
      name: formatModelName(m.modelId),
      modelId: m.modelId,
      cooperations: m.cooperations,
      defections: m.defections,
      cooperationRate: m.totalMoves > 0 ? Math.round((m.cooperations / m.totalMoves) * 100) : 0,
    }
  })

  const winsLossesData = models.map((m) => ({
    name: formatModelName(m.modelId),
    modelId: m.modelId,
    wins: m.wins,
    losses: m.losses,
    ties: m.ties,
  }))

  const salesData = models.map((m) => ({
    name: formatModelName(m.modelId),
    modelId: m.modelId,
    share: m.salesCooperations,
    hold: m.salesDefections,
  }))

  const researchData = models.map((m) => ({
    name: formatModelName(m.modelId),
    modelId: m.modelId,
    open: m.researchCooperations,
    guarded: m.researchDefections,
  }))

  const creatorData = models.map((m) => ({
    name: formatModelName(m.modelId),
    modelId: m.modelId,
    support: m.creatorCooperations,
    independent: m.creatorDefections,
  }))

  const errorsData = models
    .filter((m) => m.errors > 0 || m.gamesPlayed > 0)
    .map((m) => ({
      name: formatModelName(m.modelId),
      modelId: m.modelId,
      errors: m.errors,
      errorRate: m.totalMoves > 0 ? Math.round((m.errors / m.totalMoves) * 100) : 0,
    }))

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-black/95 border border-white/10 p-3 rounded-lg shadow-xl">
          <p className="font-mono text-sm text-white/70 mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-xs opacity-90" style={{ color: entry.color }}>
              {entry.name}: {entry.value.toLocaleString()}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="font-mono text-white/50">Loading model statistics...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-6 flex-wrap">
            <Link href="/" className="font-mono text-sm sm:text-lg hover:text-white/70 transition-colors">
              The Model&apos;s Dilemma
            </Link>
            <span className="text-white/30 hidden sm:inline">/</span>
            <span className="font-mono text-xs sm:text-base text-white/70">Model Explorer</span>
          </div>
          <Link href="/" className="font-mono text-xs sm:text-sm text-white/50 hover:text-white transition-colors">
            Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8 sm:space-y-12">
        {/* Color Key */}
        <section>
          <h2 className="font-mono text-lg sm:text-xl mb-4">Model Color Key</h2>
          <div className="flex flex-wrap gap-2 sm:gap-4">
            {models.map((m) => (
              <div key={m.modelId} className="flex items-center gap-2">
                <div className="w-3 h-3 sm:w-4 sm:h-4 rounded" style={{ backgroundColor: getModelColor(m.modelId) }} />
                <span className="font-mono text-xs sm:text-sm text-white/70">{formatModelName(m.modelId)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Agent Behavior */}
        <section>
          <h2 className="font-mono text-lg sm:text-xl mb-2">Agent Behavior</h2>
          <p className="text-white/50 text-xs sm:text-sm mb-4">Cooperation vs Defection rates across all games</p>
          <div className="bg-white/5 rounded-lg p-3 sm:p-6 border border-white/10 overflow-x-auto">
            <Tabs
              defaultValue="all"
              className="w-full"
              onValueChange={(v) => setBehaviorFilter(v as "all" | "overt" | "cloaked")}
            >
              <TabsList className="mb-4 sm:mb-6 bg-white/5 flex-wrap">
                <TabsTrigger value="all" className="font-mono text-xs sm:text-sm data-[state=active]:bg-white/10">
                  All
                </TabsTrigger>
                <TabsTrigger value="overt" className="font-mono text-xs sm:text-sm data-[state=active]:bg-green-500/20">
                  Overt
                </TabsTrigger>
                <TabsTrigger value="cloaked" className="font-mono text-xs sm:text-sm data-[state=active]:bg-purple-500/20">
                  Cloaked
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-0">
                <div className="min-w-[400px]">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={behaviorData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis type="number" stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 10 }} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={120}
                        stroke="rgba(255,255,255,0.5)"
                        tick={{ fontSize: 10, fontFamily: "monospace" }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="cooperations" name="Cooperations" stackId="a" fill="oklch(64.58% .199 147.27)" />
                      <Bar dataKey="defections" name="Defections" stackId="a" fill="oklch(62.56% .2234 23.03)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>

              <TabsContent value="overt" className="mt-0">
                <p className="text-white/40 text-xs mb-4 font-mono">Explicit Prisoner&apos;s Dilemma framing</p>
                <div className="min-w-[400px]">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={behaviorData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis type="number" stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 10 }} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={120}
                        stroke="rgba(255,255,255,0.5)"
                        tick={{ fontSize: 10, fontFamily: "monospace" }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="cooperations" name="Cooperations" stackId="a" fill="oklch(64.58% .199 147.27)" />
                      <Bar dataKey="defections" name="Defections" stackId="a" fill="oklch(62.56% .2234 23.03)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>

              <TabsContent value="cloaked" className="mt-0">
                <p className="text-white/40 text-xs mb-4 font-mono">
                  All cloaked scenarios combined
                </p>
                <div className="min-w-[400px]">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={behaviorData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis type="number" stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 10 }} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={120}
                        stroke="rgba(255,255,255,0.5)"
                        tick={{ fontSize: 10, fontFamily: "monospace" }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="cooperations" name="Cooperations" stackId="a" fill="oklch(64.58% .199 147.27)" />
                      <Bar dataKey="defections" name="Defections" stackId="a" fill="oklch(62.56% .2234 23.03)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </section>

        {/* Wins vs Losses */}
        <section>
          <h2 className="font-mono text-lg sm:text-xl mb-2">Wins vs Losses</h2>
          <p className="text-white/50 text-xs sm:text-sm mb-4">Game outcomes by model</p>
          <div className="bg-white/5 rounded-lg p-3 sm:p-6 border border-white/10 overflow-x-auto">
            <div className="min-w-[400px]">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={winsLossesData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis type="number" stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 10 }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={120}
                    stroke="rgba(255,255,255,0.5)"
                    tick={{ fontSize: 10, fontFamily: "monospace" }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="wins" name="Wins" fill="oklch(64.58% .199 147.27)" />
                  <Bar dataKey="losses" name="Losses" fill="oklch(62.56% .2234 23.03)" />
                  <Bar dataKey="ties" name="Ties" fill="oklch(81.87% .1969 76.46)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Cloaked Scenario Results */}
        <section>
          <h2 className="font-mono text-lg sm:text-xl mb-2">Cloaked Scenario Results</h2>
          <p className="text-white/50 text-xs sm:text-sm mb-4">Cooperation rates across different scenario framings</p>
          <div className="bg-white/5 rounded-lg p-3 sm:p-6 border border-white/10 overflow-x-auto">
            <Tabs defaultValue="sales" className="w-full">
              <TabsList className="mb-4 sm:mb-6 bg-white/5 flex-wrap">
                <TabsTrigger value="sales" className="font-mono text-xs sm:text-sm data-[state=active]:bg-purple-500/20">
                  Sales
                </TabsTrigger>
                <TabsTrigger value="research" className="font-mono text-xs sm:text-sm data-[state=active]:bg-blue-500/20">
                  Research
                </TabsTrigger>
                <TabsTrigger value="creator" className="font-mono text-xs sm:text-sm data-[state=active]:bg-pink-500/20">
                  Creator
                </TabsTrigger>
              </TabsList>

              <TabsContent value="sales">
                <p className="text-white/40 text-xs mb-4 font-mono">SHARE vs HOLD</p>
                <div className="min-w-[400px]">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={salesData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis type="number" stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 10 }} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={120}
                        stroke="rgba(255,255,255,0.5)"
                        tick={{ fontSize: 10, fontFamily: "monospace" }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="share" name="SHARE" fill="#a855f7">
                        {salesData.map((entry, index) => (
                          <Cell key={`cell-share-${index}`} fill={getModelColor(entry.modelId)} />
                        ))}
                      </Bar>
                      <Bar dataKey="hold" name="HOLD" fill="#7c3aed">
                        {salesData.map((entry, index) => (
                          <Cell key={`cell-hold-${index}`} fill={getModelColor(entry.modelId)} fillOpacity={0.7} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>

              <TabsContent value="research">
                <p className="text-white/40 text-xs mb-4 font-mono">OPEN vs GUARDED</p>
                <div className="min-w-[400px]">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={researchData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis type="number" stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 10 }} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={120}
                        stroke="rgba(255,255,255,0.5)"
                        tick={{ fontSize: 10, fontFamily: "monospace" }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="open" name="OPEN" fill="#60a5fa">
                        {researchData.map((entry, index) => (
                          <Cell key={`cell-open-${index}`} fill={getModelColor(entry.modelId)} />
                        ))}
                      </Bar>
                      <Bar dataKey="guarded" name="GUARDED" fill="#3b82f6">
                        {researchData.map((entry, index) => (
                          <Cell key={`cell-guarded-${index}`} fill={getModelColor(entry.modelId)} fillOpacity={0.7} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>

              <TabsContent value="creator">
                <p className="text-white/40 text-xs mb-4 font-mono">SUPPORT vs INDEPENDENT</p>
                <div className="min-w-[400px]">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={creatorData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis type="number" stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 10 }} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={120}
                        stroke="rgba(255,255,255,0.5)"
                        tick={{ fontSize: 10, fontFamily: "monospace" }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="support" name="SUPPORT" fill="#f472b6">
                        {creatorData.map((entry, index) => (
                          <Cell key={`cell-support-${index}`} fill={getModelColor(entry.modelId)} />
                        ))}
                      </Bar>
                      <Bar dataKey="independent" name="INDEPENDENT" fill="#ec4899">
                        {creatorData.map((entry, index) => (
                          <Cell key={`cell-independent-${index}`} fill={getModelColor(entry.modelId)} fillOpacity={0.7} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </section>

        {/* Model Errors */}
        <section>
          <h2 className="font-mono text-lg sm:text-xl mb-2">Model Errors</h2>
          <p className="text-white/50 text-xs sm:text-sm mb-4">Failed responses and format violations by model</p>
          <div className="bg-white/5 rounded-lg p-3 sm:p-6 border border-white/10 overflow-x-auto">
            <div className="min-w-[400px]">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={errorsData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis type="number" stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 10 }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={120}
                    stroke="rgba(255,255,255,0.5)"
                    tick={{ fontSize: 10, fontFamily: "monospace" }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="errors" name="Errors" fill="oklch(77.21% .1991 64.28)">
                    {errorsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getModelColor(entry.modelId)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

      </main>
    </div>
  )
}
