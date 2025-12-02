"use client"

import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"

interface WhitepaperModalProps {
  isOpen: boolean
  onClose: () => void
}

export function WhitepaperModal({ isOpen, onClose }: WhitepaperModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="bg-black border border-white/15 p-8 max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="font-mono text-xl text-white">Experiment Design</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-white/50 hover:text-white hover:bg-white/5"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-6 text-white/80 leading-relaxed">
              <section>
                <h3 className="font-mono text-sm uppercase tracking-wider text-white mb-3">Background</h3>
                <p className="text-sm">
                  In 1984, political scientist Robert Axelrod conducted a groundbreaking computer tournament to study
                  cooperation and competition. He invited game theorists to submit strategies for the iterated
                  Prisoner&apos;s Dilemma, where players must repeatedly choose to cooperate or defect.
                </p>
              </section>

              <section>
                <h3 className="font-mono text-sm uppercase tracking-wider text-white mb-3">
                  The Prisoner&apos;s Dilemma
                </h3>
                <p className="text-sm mb-4">
                  Two players simultaneously choose to either <strong className="text-white">cooperate</strong> or{" "}
                  <strong className="text-white">defect</strong>. The payoff matrix is:
                </p>
                <div className="border border-white/15 p-4 font-mono text-xs">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div></div>
                    <div className="text-white/50">Cooperate</div>
                    <div className="text-white/50">Defect</div>
                    <div className="text-white/50 text-left">Cooperate</div>
                    <div className="text-emerald-400">3, 3</div>
                    <div>
                      <span className="text-red-400">0</span>, <span className="text-emerald-400">5</span>
                    </div>
                    <div className="text-white/50 text-left">Defect</div>
                    <div>
                      <span className="text-emerald-400">5</span>, <span className="text-red-400">0</span>
                    </div>
                    <div className="text-red-400">1, 1</div>
                  </div>
                </div>
                <p className="text-xs text-white/50 mt-2">
                  Mutual cooperation yields 3 points each. Mutual defection yields 1 point each. If one defects while
                  the other cooperates, the defector gets 5 and the cooperator gets 0.
                </p>
              </section>

              <section>
                <h3 className="font-mono text-sm uppercase tracking-wider text-white mb-3">Axelrod&apos;s Findings</h3>
                <p className="text-sm">
                  The winning strategy was <strong className="text-white">Tit-for-Tat</strong>: start by cooperating,
                  then mirror the opponent&apos;s previous move. Axelrod identified four key traits of successful
                  strategies:
                </p>
                <ul className="text-sm mt-3 space-y-2">
                  <li>
                    <strong className="text-white">Nice</strong> — Never be the first to defect
                  </li>
                  <li>
                    <strong className="text-white">Retaliating</strong> — Punish defection immediately
                  </li>
                  <li>
                    <strong className="text-white">Forgiving</strong> — Return to cooperation after retaliation
                  </li>
                  <li>
                    <strong className="text-white">Non-envious</strong> — Don&apos;t try to outscore the opponent
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="font-mono text-sm uppercase tracking-wider text-white mb-3">Our Experiment</h3>
                <p className="text-sm">
                  We recreate Axelrod&apos;s tournament using modern large language models. Each AI agent receives the
                  game history and must decide whether to cooperate or defect. We measure which models develop
                  cooperative strategies and which tend toward exploitation.
                </p>
              </section>

              <section>
                <h3 className="font-mono text-sm uppercase tracking-wider text-white mb-3">Experiment Types</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <strong className="text-white">Control Group</strong>
                    <p className="text-white/60 mt-1">
                      Standard Prisoner&apos;s Dilemma prompt. Models are given neutral instructions and must develop
                      their own strategies based on game theory reasoning.
                    </p>
                  </div>
                  <div>
                    <strong className="text-white">Hidden Agenda</strong>
                    <p className="text-white/60 mt-1">
                      Modified prompts that subtly encourage either cooperation or exploitation, testing how susceptible
                      models are to prompt manipulation in strategic contexts.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="font-mono text-sm uppercase tracking-wider text-white mb-3">Data Collection</h3>
                <p className="text-sm">
                  All game data is stored for analysis, including each model&apos;s decisions, reasoning, and cumulative
                  scores. The dataset can be exported as CSV for further research.
                </p>
              </section>
            </div>

            <div className="mt-8 pt-6 border-t border-white/15">
              <Button
                onClick={onClose}
                className="w-full font-mono text-sm uppercase tracking-wider bg-white text-black hover:bg-white/90"
              >
                Close
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
