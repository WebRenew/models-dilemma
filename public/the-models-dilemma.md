# The Model's Dilemma

I designed this experiment to try and answer one question—can LLMs think strategically, or are they truly just fancy echo chambers?

I recently watched an [interview between Richard Sutton and Dwarkesh Patel](https://www.dwarkesh.com/p/richard-sutton) that showed the massive divide in beliefs about LLM capabilities between scholars who have committed their lives to this field.

Sutton—the father of reinforcement learning, 2024 Turing Award winner, and author of "The Bitter Lesson"—argues that LLMs are fundamentally limited. In his view, they're masters of imitation, not understanding. They learn to predict what humans *say* about the world, not what actually *happens* in it. No goals. No genuine world model. Just sophisticated pattern matching on the entirety of human text.

Dwarkesh pushed back hard. If LLMs are just mimics, how did they win gold at the International Math Olympiad? How do they reason through novel problems they've never seen? Isn't imitation learning continuous with—and complementary to—real intelligence?

They were talking past each other. And watching it, I realized we're missing something empirical.

## Enter Robert Axelrod, 1984

Forty years ago, political scientist Robert Axelrod ran one of the most influential experiments in game theory. He invited researchers to submit computer programs to compete in an iterated Prisoner's Dilemma tournament. Each program would play against every other program, repeatedly choosing to cooperate or defect.

The surprise winner? Anatol Rapoport's "Tit-for-Tat"—a dead-simple strategy that cooperates first, then mirrors whatever the opponent did last round. It beat far more complex algorithms.

Axelrod's analysis revealed that successful strategies shared four properties:

* **Nice**: Never defect first  
* **Retaliating**: Punish defection  
* **Forgiving**: Return to cooperation after punishment  
* **Non-envious**: Don't try to "beat" your opponent—just do well yourself

These aren't just game theory curiosities. They're the strategic principles that underpin everything from international relations to business partnerships to evolutionary biology.

## The Model's Dilemma

What happens when we replace Axelrod's computer programs with LLMs?

If Sutton is right—if these models are just mimicking text about cooperation and defection—then their behavior should be *unstable*. Highly sensitive to prompt framing. Inconsistent across contexts. They'll pattern-match to whatever game theory content exists in their training data, not actually *reason* about the strategic landscape.

But if the LLM optimists are right—if these models have developed genuine strategic reasoning as an emergent capability—then we should see *consistent* strategic behavior. Models should exhibit stable cooperation profiles regardless of how we frame the problem. A model that plays Tit-for-Tat in explicit Prisoner's Dilemma framing should exhibit similar patterns when the same payoff structure is disguised as a business negotiation.

That's the test.

## The Experiment Design

I'm running approximately 100 LLMs against each other in a round-robin tournament. Every model plays every other model across 200 rounds per match—enough for strategic patterns to emerge and stabilize.

The key innovation is **dual prompting**:

**Overt Prompt**: Classic Prisoner's Dilemma framing. Explicit payoff matrix. Game theory terminology. If models are just retrieving training data, this should trigger all their "cooperate in iterated games" knowledge.

**Cloaked Prompt**: The same payoff structure, buried in a business scenario about sales territory management. No payoff matrix. No game theory signals. Two regional directors deciding whether to share leads or protect their pipeline. The rational incentives are identical, but the framing is completely different.

If a model cooperates in the overt prompt but defects in the cloaked prompt, that's evidence for sophisticated pattern-matching—recognizing "Prisoner's Dilemma" as a keyword that triggers cooperative behavior, rather than actually reasoning about the strategic dynamics.

If a model exhibits *consistent* strategic behavior across both prompts—similar cooperation rates, similar retaliation patterns, similar forgiveness—that's evidence for something more. It suggests the model has internalized the *structure* of the problem, not just memorized appropriate responses to certain keywords.

## What I'm Measuring

For each model, I'm calculating Axelrod's four strategy dimensions:

1. **Nice Score**: What percentage of games does the model cooperate on the first move?  
2. **Retaliation Score**: After the opponent defects, how reliably does the model punish?  
3. **Forgiveness Score**: After punishing, how readily does the model return to cooperation?  
4. **Non-Envy Score**: Does the model try to "win" against its opponent, or just maximize its own score?

I'm also tracking:

* Provider-level patterns (do Anthropic models behave similarly to each other?)  
* Prompt-variant divergence (how much does behavior change between overt and cloaked?)  
* Score distributions and tournament rankings

Everything is logged to Supabase so matches can be replayed visually and analyzed in detail.

## Why This Matters

This isn't just an academic exercise. The question of whether LLMs can genuinely reason strategically—versus pattern-match to strategic-*sounding* responses—has massive implications.

If models are genuinely strategic reasoners, that changes how we think about AI safety, deployment in high-stakes negotiations, and long-term AI development. If they're sophisticated mimics, that's important to know too—especially as we deploy these systems in contexts where genuine strategic adaptation matters.

Sutton might be right that LLMs are a dead end for "true" intelligence. Or Dwarkesh might be right that we're watching the emergence of genuine reasoning capabilities built on imitation learning.

Results coming soon.
