# Causal graphs & interventions (structural causal models)

**Reach for it when** the model is a **graph of causes** — a DAG / structural causal model where the
question is *intervention* (do-operator) or counterfactual, not just association: confounding,
backdoor/front-door paths, mediation, colliders, treatment-effect estimation. **Show the graph first**,
then the difference between what you *observe* and what an *intervention* would do.

> Distinct from [causal-inference.md](causal-inference.md): that family is multisensory **Bayesian
> causal inference** (one-cause-vs-two cue combination). This one is **Pearl-style** structural causal
> modelling — a graph with `do()` interventions. Same word, different model class.

## Canonical form

- **Linear-Gaussian SCM** (template exemplar `causalg`). Each node is a weighted sum of its parents
  plus Gaussian noise; e.g. a confounder U → treatment X and outcome Y, with a causal path X → M → Y:
  `U=ε; X=w_UX·U+ε; M=w_XM·X+ε; Y=M+w_UY·U+ε`. The **observational** slope of Y on X mixes the causal
  path with the backdoor X ← U → Y; the **interventional** slope under `do(X=x)` (which severs U → X,
  so the parents of X are replaced by the set value) recovers the true causal effect `w_XM`. The gap
  between them is exactly the confounding.
- **Discrete Bayes networks / interventions** (compose) — categorical nodes, CPDs, do() by mutilating
  the graph; show the joint, an intervention, and a counterfactual.

## Parameters (meaning + typical ranges)

- Confounding strength (the backdoor weights U→X, U→Y) — drives the observed-vs-causal gap.
- Causal-path strength (X→M, M→Y) — the true effect the intervention recovers.
- Noise σ.

## Angles (structure first)

1. **Structure** — the DAG (nodes + directed edges, the backdoor highlighted), drawn with `g.graph`.
2. **Observe** — the observational association (scatter + regression slope), confounded.
3. **Intervene** — `do(X)`: the interventional scatter + slope, overlaid on the observational line so the
   difference is visible (the causal effect vs the confounded association).
4. **Compare** — the observed-minus-causal gap as a function of confounding strength.

## Primitive / helpers

`g.graph(nodes, edges, {r})` draws the node-link DAG (nodes at canvas-fraction `{x,y}`, directed
edges with labels/`dash`/`inhib`). The SCM itself is a few lines (sample parents → children in
topological order; for `do(X=x)` set X and drop its incoming edges). Reusable for connectomes / graphs too.

## Sources

Pearl *Causality* (2009) and *The Book of Why*; Peters–Janzing–Schölkopf *Elements of Causal Inference*;
Hernán & Robins *Causal Inference: What If* (backdoor/front-door, confounding).
