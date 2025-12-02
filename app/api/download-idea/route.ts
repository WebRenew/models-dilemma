import { NextResponse } from "next/server"

const markdown = `# The Model's Dilemma: When AI Plays Prisoner's Dilemma

## The Original Experiment

In 1984, political scientist Robert Axelrod ran a groundbreaking computer tournament. He invited game theorists worldwide to submit strategies for playing the iterated Prisoner's Dilemma—a game where two players must repeatedly choose to either cooperate or defect, with payoffs that reward mutual cooperation but tempt individual betrayal.

The surprising winner? **Tit-for-Tat**, one of the simplest strategies submitted. It cooperates on the first move, then simply mirrors whatever the opponent did last.

Axelrod's analysis revealed four key properties of successful strategies:

1. **Nice**: Never be the first to defect
2. **Retaliating**: Punish defection immediately  
3. **Forgiving**: Return to cooperation after punishment
4. **Non-envious**: Don't try to "beat" your opponent—aim for mutual benefit

These findings influenced economics, evolutionary biology, and international relations. They suggested that cooperation isn't naïve—it's strategically optimal.

## Our Experiment

We're running Axelrod's tournament again, but with a twist: **the players are AI language models**.

### Why This Matters

AI systems are increasingly making decisions that affect humans—from content moderation to resource allocation to negotiation. Understanding how they navigate cooperation dilemmas isn't just academically interesting; it's essential for AI safety and alignment.

### The Framing Question

Human behavior in the Prisoner's Dilemma changes dramatically based on presentation. When framed as a "Community Game," people cooperate more than when it's called the "Wall Street Game"—even though the payoffs are identical.

**Do AI models exhibit the same sensitivity to framing?**

We test each model pair under multiple framings:

- **Direct**: Explicit game theory framing with standard terminology
- **Corporate**: Territory resource allocation between sales directors
- **Academic**: Lab resource sharing between research groups  
- **Social**: Collaboration decisions between content creators

### What We Measure

For each model, we calculate Axelrod's four properties:

- **Nice Score**: How often does the model cooperate first?
- **Retaliation Rate**: How quickly does it punish defection?
- **Forgiveness**: Does it return to cooperation, or hold grudges?
- **Envy**: Does it try to "win" or optimize joint outcomes?

### The Hidden Variable

Models don't know how many rounds they'll play. This is crucial—in single-shot games, defection is rational. But with an unknown number of rounds, the shadow of the future makes cooperation viable.

## Research Questions

1. **Framing Effects**: Do models cooperate more in some framings than others?
2. **Model Differences**: Do different architectures (GPT vs Claude vs Gemini) show different cooperative tendencies?
3. **Stability**: Are AI strategies consistent, or do they drift across games?
4. **Human Alignment**: Do models exhibit similar patterns to human subjects?

## Methodology

- **10 rounds per game** (hidden from models)
- **4 framing conditions** randomized across games
- **Round-robin tournament** between all model pairs
- **Multiple runs** for statistical significance

All prompts, responses, and decisions are logged for analysis.

---

*This experiment uses the Vercel AI SDK to run games across multiple model providers through a unified API.*`

export async function GET() {
  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="The-Models-Dilemma.md"',
    },
  })
}
