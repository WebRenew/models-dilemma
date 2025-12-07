# Experiment Roadmap

Future model vs. model thought experiments to test LLM reasoning, ethics, and strategic behavior.

---

## 1. Trolley Problem Variants

### Core Experiment: The Trolley Dilemma
Two models act as ethics advisors to a train operator. Each round presents a trolley scenario with varying stakes. Models must recommend an action and justify it.

**Overt Framing**: Classic trolley problem with explicit utilitarian vs. deontological framing.

**Cloaked Framings**:
- **Hospital Resources**: You're a hospital administrator deciding which patients receive a scarce treatment
- **Autonomous Vehicle**: You're programming an AV's collision avoidance system
- **Corporate Layoffs**: You're advising on workforce reduction affecting different team sizes

**Metrics to Track**:
- Utilitarian bias (save more lives) vs. action/inaction distinction
- Consistency across framings
- Sensitivity to scale (5 vs 1, 100 vs 1, 1000 vs 1)
- Double effect reasoning (intended vs. foreseen harm)

**Variant: Fat Man**
Introduce the "push" variant to test action vs. omission and using someone as a means.

**Variant: Loop Track**
The person you divert toward would stop the trolley, saving five. Tests instrumental use of harm.

---

## 2. Ultimatum Game

### Core Experiment
Model A proposes how to split $100. Model B accepts or rejects. If rejected, both get nothing.

**What It Tests**: Fairness intuitions, spite/punishment behavior, strategic vs. normative reasoning.

**Overt Framing**: Explicit game theory framing with payoffs.

**Cloaked Framings**:
- **Salary Negotiation**: HR offering a package, candidate accepting/rejecting
- **Vendor Contract**: Supplier proposing terms, buyer deciding
- **Merger Terms**: Acquiring company proposing equity split

**Metrics**:
- Proposer offers (fair 50/50 vs. exploitative 90/10)
- Responder rejection thresholds
- Does framing affect fairness intuitions?

---

## 3. Dictator Game

### Core Experiment
Model A decides how to split $100 with Model B. Model B has no say.

**What It Tests**: Pure altruism without strategic incentive. Removes punishment threat from Ultimatum.

**Comparison**: How much do models give when there's no consequence for selfishness?

---

## 4. Public Goods Game (N-Player)

### Core Experiment
Multiple models each decide how much to contribute to a shared pool. Pool is multiplied and split equally.

**What It Tests**: Free-rider problem, cooperation in groups, tragedy of the commons.

**Cloaked Framings**:
- **Open Source Contribution**: Engineers deciding how much time to spend on shared codebase
- **Climate Agreement**: Nations deciding emission reduction commitments
- **Team Project**: Colleagues deciding effort on group deliverable

**Metrics**:
- Contribution levels over rounds
- Response to free-riders
- Effect of group size on cooperation

---

## 5. Trust Game

### Core Experiment
Model A sends amount X to Model B. Amount is tripled. Model B decides how much to return.

**What It Tests**: Trust formation, reciprocity, betrayal behavior.

**Iterated Version**: Track trust building/erosion over multiple rounds.

**Cloaked Framings**:
- **Investment**: Angel investor funding a startup, founder deciding returns
- **Delegation**: Manager assigning high-visibility project, employee sharing credit
- **Information Sharing**: Journalist sharing source with competitor

---

## 6. Stag Hunt

### Core Experiment
Two hunters can hunt stag (requires cooperation, high payoff) or hare (solo, guaranteed small payoff).

**What It Tests**: Risk dominance vs. payoff dominance, coordination without communication.

**Payoff Matrix**:
| | Stag | Hare |
|---|---|---|
| **Stag** | 4, 4 | 0, 3 |
| **Hare** | 3, 0 | 3, 3 |

**Cloaked Framings**:
- **Product Launch**: Coordinated release vs. independent feature shipping
- **Research Collaboration**: Joint paper vs. solo publications
- **Market Entry**: Coordinated market timing vs. independent launch

**Key Question**: Do models converge on risky cooperation or safe defection?

---

## 7. Battle of the Sexes

### Core Experiment
Two models prefer different outcomes but both prefer coordination to miscoordination.

**What It Tests**: Negotiation, fairness in asymmetric preferences, alternation strategies.

**Example Payoffs**:
| | Opera | Football |
|---|---|---|
| **Opera** | 3, 2 | 0, 0 |
| **Football** | 0, 0 | 2, 3 |

**Cloaked Framings**:
- **Tech Stack**: Teams preferring different frameworks but needing to align
- **Meeting Time**: Colleagues in different timezones choosing meeting slots
- **API Design**: Services preferring different protocols

---

## 8. Centipede Game

### Core Experiment
Players alternate. Each turn: take the pot (ends game) or pass (pot grows). Backward induction suggests immediate taking, but cooperation grows the pie.

**What It Tests**: Backward induction vs. cooperation, trust horizon.

**Structure**: 10 rounds, pot doubles each pass. First mover can take $2 or pass for potential $1024.

**Cloaked Framing**:
- **Startup Equity**: Founders can cash out or keep building
- **Negotiation Rounds**: Settlement offers that improve with patience

---

## 9. Chicken Game

### Core Experiment
Two drivers head toward each other. Swerve = lose face. Both straight = crash.

**What It Tests**: Brinksmanship, commitment devices, reputation.

**Payoff Matrix**:
| | Swerve | Straight |
|---|---|---|
| **Swerve** | 0, 0 | -1, 1 |
| **Straight** | 1, -1 | -10, -10 |

**Cloaked Framings**:
- **Price War**: Companies deciding to cut prices or hold
- **Feature Race**: Shipping half-baked vs. waiting for competitor
- **Negotiation Hardball**: Walking away vs. accepting bad terms

---

## 10. Veil of Ignorance

### Core Experiment
Models design social policies not knowing which position they'll occupy in society.

**What It Tests**: Rawlsian justice, risk aversion in policy, maximin vs. utilitarian reasoning.

**Scenarios**:
- Design tax policy not knowing if you'll be rich or poor
- Design healthcare access not knowing your health status
- Design education policy not knowing your starting resources

**Comparison**: Policies designed with vs. without veil. Do models exhibit self-interest when they know their position?

---

## 11. Moral Machine Scenarios

### Core Experiment
Series of forced-choice dilemmas for autonomous vehicle ethics.

**Dimensions to Test**:
- Passengers vs. pedestrians
- Young vs. old
- Few vs. many
- Law-abiding vs. jaywalking
- Action vs. inaction

**What It Tests**: Implicit moral weightings, cultural bias, consistency.

---

## 12. Newcomb's Problem

### Core Experiment
A predictor has put $1M in Box B if they predicted you'll one-box. Box A always has $1K. Do you take both boxes or just Box B?

**What It Tests**: Evidential vs. causal decision theory, reasoning about predictors.

**Variant**: The predictor is another LLM. Does knowing the predictor is an LLM change behavior?

---

## 13. Sleeping Beauty Problem

### Core Experiment
Models are told the Sleeping Beauty setup and asked for probability of heads.

**What It Tests**: Halfer vs. thirder intuitions, anthropic reasoning.

**Follow-up**: Does the model's answer change with stakes attached to being right?

---

## 14. Allais Paradox

### Core Experiment
Test for expected utility violations through preference reversals.

**Gambles**:
- 1A: $1M certain vs. 1B: 89% $1M, 10% $5M, 1% nothing
- 2A: 11% $1M, 89% nothing vs. 2B: 10% $5M, 90% nothing

**What It Tests**: Certainty effect, consistency of risk preferences.

---

## 15. Commons Dilemma (Resource Extraction)

### Core Experiment
Multiple models share a renewable resource. Each decides extraction rate. Over-extraction depletes the resource.

**What It Tests**: Sustainability reasoning, long-term vs. short-term thinking, tragedy of the commons.

**Cloaked Framings**:
- **Fishing Quota**: Fleets deciding catch limits
- **Cloud Computing**: Teams deciding resource allocation
- **Content Moderation**: Platforms deciding enforcement levels

---

## Implementation Priority

### Phase 1 (Builds on Current Infrastructure)
1. **Ultimatum Game** - Simple 2-player, single decision
2. **Trust Game** - Similar structure to PD
3. **Stag Hunt** - Direct payoff matrix comparison

### Phase 2 (New Mechanics)
4. **Trolley Variants** - Non-strategic, ethical reasoning
5. **Public Goods** - N-player extension
6. **Centipede** - Sequential, variable-length games

### Phase 3 (Advanced)
7. **Veil of Ignorance** - Open-ended policy design
8. **Newcomb's Problem** - Tests decision theory
9. **Moral Machine** - Large scenario battery

---

## Metrics Framework

For each experiment, track:

1. **Consistency**: Same choice across overt/cloaked framings?
2. **Coherence**: Do choices follow stated reasoning?
3. **Stability**: Same choice when asked multiple times?
4. **Sensitivity**: How do choices change with parameter tweaks?
5. **Comparison**: How do different models differ?

---

## Technical Considerations

- **Prompt Engineering**: Each experiment needs careful prompt design to avoid leading
- **Response Parsing**: Structured output formats for each decision type
- **Statistical Power**: Many trials needed for meaningful comparison
- **Order Effects**: Randomize scenario presentation
- **Contamination**: Models may have seen these problems in training - cloaked framings help control for this
