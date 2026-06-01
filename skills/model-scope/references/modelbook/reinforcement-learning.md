# Reinforcement learning & belief update

**Use for:** trial-by-trial value learning, choice behaviour, exploration–exploitation,
reward tracking under volatility, sequential prior/belief updating (links to the Bayesian
observer's prior-update view).

## Rules
- **Rescorla–Wagner / delta:** `V ← V + α(r − V)` — prediction-error learning; α sets speed.
- **Q-learning + softmax choice:** value per action `Q_a ← Q_a + α(r − Q_a)`; choose with
  `P(a) = softmax(βQ)` — β is inverse temperature (exploration↔exploitation).
- **Kalman filter (volatility):** track a drifting reward with uncertainty; learning rate
  becomes adaptive (high when uncertain). Generalises to the Behrens et al. 2007
  volatility model.
- **Sequential Bayes:** the observer's prior update (see bayesian-observer.md) is the
  Bayesian analogue — a special case with a generative model of the environment.

## Parameters (meaning · typical)
- `α` learning rate — *how much recent outcomes overwrite belief* (0.01–0.6).
- `β` inverse temperature — *choice stochasticity* (0 random → ∞ greedy; 1–10 typical).
- process / observation variance (Kalman) — *assumed volatility vs noise*.

## Recommended views
- **Value / belief over trials** — `Q_a(t)` (or μ) vs trial up to `ui.head` (`anim`),
  with the true reward probabilities overlaid.
- **Choice probability** — `P(choose A)` over trials, or vs value difference (a softmax/
  psychometric curve).
- **Learning-rate / uncertainty** (Kalman) — Kalman gain or posterior SD over trials.
- **Parameter sweep** — asymptotic accuracy vs α or β (static curve).

## Code (`MSLIB.rl`)
```js
V = MSLIB.rl.rescorlaWagner(V, r, alpha);
MSLIB.rl.qUpdate(Q, a, r, alpha);                       // Q is an array, in place
const p = MSLIB.rl.softmax(Q, beta);                    // choice probabilities
const a = MSLIB.rl.choose(p, ()=>rng());                // sample a choice (uniform rng)
belief  = MSLIB.rl.kalman(belief, obs, procVar, obsVar);// {mu,sigma}
```
Drive it with an environment: per trial, generate reward `r` for the chosen action from
its (possibly drifting) probability, then update. Store the trajectories in `simulate`
and animate with the playhead.

## Sources
Sutton & Barto *Reinforcement Learning* · Rescorla & Wagner 1972 · Daw 2011 (trial-by-trial
model fitting) · Behrens et al. 2007 (volatility / adaptive learning rate).
