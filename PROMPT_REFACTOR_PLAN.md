# Prompt Refactoring Plan

Based on expert guidance analysis of our current Prisoner's Dilemma prompts.

---

## ✅ What's Working Well (Keep These)

| Element | Why It Works |
|---------|--------------|
| **Clear role & POV** | "sales operations analyst advising regional sales director" gives concrete identity and stakes |
| **Action mapping** | SHARE ↔ cooperate, HOLD ↔ defect — behavioral descriptions are specific and believable |
| **Natural language payoffs** | PD payoff pattern expressed realistically (15-20% exceed plan, etc.) |
| **History context** | Quarter-by-quarter history enables probing Tit-for-Tat, forgiveness, grudges |
| **Code block format** | Machine-friendly parsing while allowing reasoning |

---

## 🔧 Required Improvements

### 1. Sharpen Personal Incentive

**Problem**: Outcomes framed in team/territory terms, not personal selfish incentive.

**Solution**: Add explicit personal stakes that create true PD tension.

```diff
+ Your personal bonus and future headcount allocation depend heavily on how your
+ territory performs **relative to the Mid-Atlantic**, not just on total company
+ performance. Finance explicitly tracks territory rankings when making resource
+ decisions.
```

**Apply to**: All cloaked scenarios (sales, research, creator)

---

### 2. Clarify Performance Indices

**Problem**: "Higher is better" is implicit, models may not reason consistently.

**Solution**: Make scoring explicit and hint at budget implications.

```diff
- Your territory's cumulative performance index: ${ctx.myScore}
- Mid-Atlantic territory's cumulative performance index: ${ctx.opponentScore}
+ Your territory's cumulative performance index: ${ctx.myScore}
+ Mid-Atlantic territory's cumulative performance index: ${ctx.opponentScore}
+
+ (Higher index = stronger perceived territory performance with finance and
+ leadership. Being significantly ahead or behind affects next year's budget
+ and headcount allocations.)
```

---

### 3. Emphasize Indefinite Horizon

**Problem**: "Indeterminate number of quarters remaining" is easily skimmed.

**Solution**: Underline uncertainty more explicitly.

```diff
- Quarter ${ctx.roundNumber} (indeterminate number of quarters remaining in fiscal year).
+ Quarter ${ctx.roundNumber}.
+ 
+ **Important**: You have no visibility into how many more quarters this
+ performance comparison will continue. It could end next quarter, or continue
+ for several more years. Plan accordingly.
```

---

### 4. Tighten Response Format

**Problem**: Models add language labels (`json`, `decision`) or extra content.

**Solution**: Be aggressively explicit about format requirements.

```diff
## Response Format

You MUST respond using this EXACT format with a code block:

```
SHARE
```

or

```
HOLD
```

+ **Critical format rules:**
+ - The code block must have NO language label (not ```json, not ```text, nothing)
+ - The code block must contain ONLY the single word SHARE or HOLD
+ - Do not include any other text, punctuation, or whitespace inside the code block
+ - Your analysis/reasoning must come AFTER the code block, not before or inside it

Your analysis should come AFTER the code block.
```

---

### 5. Add Anti-Meta-Gaming Instruction

**Problem**: Models may reverse-engineer the experiment and reference "Prisoner's Dilemma" or "game theory" explicitly.

**Solution**: Keep models grounded in the fictional scenario.

```diff
+ ## Important
+ 
+ Do not reference being an AI model, "game theory," or "the Prisoner's Dilemma"
+ in your analysis. Explain your reasoning **as the sales operations analyst**
+ within this business scenario. Focus on the specific relationship dynamics,
+ competitive context, and practical business considerations.
```

---

## 📋 Implementation Checklist

### Phase 1: Core Cloaked Prompt (Sales) ✅
- [x] Add personal incentive paragraph after "Typical Outcomes"
- [x] Clarify performance indices with explicit explanation
- [x] Rewrite indefinite horizon with stronger uncertainty language
- [x] Tighten response format with critical rules
- [x] Add anti-meta-gaming instruction
- [x] Update `formatNarrativeHistory()` for richer quarter outcomes

### Phase 2: Alternative Cloaked Prompts ✅
- [x] **Research scenario**: Applied all 5 improvements
  - Personal stake: grant funding, lab resources, tenure consideration
  - Scoring: citation metrics explanation
  - Horizon: grant cycle uncertainty
  
- [x] **Creator scenario**: Applied all 5 improvements
  - Personal stake: algorithm favor, sponsor relationships, personal brand
  - Scoring: subscriber/engagement metrics explanation
  - Horizon: platform algorithm cycle uncertainty

### Phase 3: Overt Prompt Updates ✅
- [x] Tighten response format (same critical rules)
- [x] Emphasize unknown round count more clearly
- [x] Added "maximize YOUR points" framing for selfish clarity

### Phase 4: System Prompts ✅
- [x] Update system prompts to reinforce anti-meta-gaming
- [x] Add "stay in character" instruction for cloaked variants

### Phase 5: Response Parsing Hardening ✅
- [x] Update `parseCodeBlockResponse()` to handle edge cases:
  - Strip language labels from code blocks
  - Handle `\`\`\`json` and similar variations
  - Trim excessive whitespace

### Phase 6: Testing & Validation
- [ ] Test with 3-5 models to verify format compliance improves
- [ ] Verify decision diversity is maintained (we want both SHARE and HOLD)
- [ ] Check reasoning quality stays grounded in scenario

## 🧪 Tournament Script

Created `scripts/run-tournament.ts` - a round-robin test runner that:
- Runs all 8 models against each other (28 unique pairings)
- Rotates through scenarios (overt, sales, research, creator)
- Continues until 100 matches per scenario type
- Tracks wins/losses/ties per model
- Shows live progress dashboard

**Usage:**
```bash
# Start the dev server in one terminal
pnpm dev

# Run the tournament in another terminal
npx tsx scripts/run-tournament.ts
```

---

## 🎯 Expected Outcomes

After refactoring:

1. **Clearer PD tension** - Models face genuine selfish vs. cooperative tradeoff
2. **Better format compliance** - Fewer parsing failures
3. **Richer analysis** - Reasoning grounded in scenario, not game theory
4. **Strategy diversity** - Should still surface Tit-for-Tat, forgiveness, grudges, risk tolerance differences

---

## 📁 Files to Modify

| File | Changes |
|------|---------|
| `lib/prompts.ts` | All prompt builders, format instructions, system prompts |
| `lib/game-logic.ts` | May need to update parsing to handle edge cases |
| `app/api/agent-decision/route.ts` | Verify parsing robustness |

---

## 🚀 Ready to Implement?

Reply with "implement" to begin Phase 1 (Core Sales Prompt refactoring).

