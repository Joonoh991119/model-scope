# Evidence accumulation & attractor decision circuits

**Use for:** two-alternative decisions, response-time distributions, speed–accuracy
trade-off, winner-take-all dynamics, the link from neural circuits to the drift-diffusion
model (DDM).

## Three levels (all reduce to / approximate the DDM)
1. **Drift-diffusion (abstract):** `dx = A·dt + c·dW`, decide at ±z. Optimal; closed-form
   `ER = 1/(1+e^{2Az/c²})`, `DT = (z/A)tanh(Az/c²)`. (The template's `ddm` model.)
2. **Leaky competing accumulators (Usher–McClelland):** two units with leak `k` and mutual
   inhibition `w`; the difference is an Ornstein–Uhlenbeck process with `λ = w−k`
   (λ<0 stable/slow, λ=0 ≈ DDM, λ>0 winner-take-all). Visualise the 2-D phase plane + the
   **energy landscape** (see references/plotting.md heatmap recipe).
3. **Wong & Wang (2006) reduced circuit (biophysical):** two NMDA-gated populations with
   self-excitation + shared inhibition and a nonlinear f–I — the mechanistic origin of the
   attractor dynamics. `MSLIB.decision` implements it.

## Wong–Wang reduced equations (`MSLIB.decision`)
- f–I transfer: `φ(I) = (aI−b)/(1−e^{−d(aI−b)})`, Hz.
- Synaptic gating: `dS_i/dt = −S_i/τ_S + (1−S_i)·γ·φ(I_i)`.
- Currents: `I_i = J_s·S_i − J_c·S_j + I₀ + J_{A,ext}·μ₀·(1 ± coh/100) + noise(OU)`.
- Defaults (Wong & Wang 2006): `a=270 Hz/nA, b=108 Hz, d=0.154 s, γ=0.641, τ_S=0.1 s,
  J_s=0.2609, J_c=0.0497, I₀=0.3255 nA, J_{A,ext}=5.2e-4 nA/Hz, μ₀=30 Hz, σ=0.02 nA`.
- Decide when a population rate crosses ~15 Hz.

## Parameters (meaning · typical range)
- `A` / `μ₀·coh` drift / coherence — *stimulus evidence strength / motion coherence*.
- `c` / `σ` noise — *internal & stimulus noise*.
- `z` threshold (DDM) — *speed–accuracy caution*.
- `k, w` leak & inhibition (LCA) — *recurrent dynamics*; sign of `λ=w−k` sets the regime.
- `J_s, J_c, I₀` (Wong–Wang) — *recurrent excitation, cross-inhibition, background drive*.

## Recommended views
- **This trial** — evidence x(t) or rates r₁(t),r₂(t) with thresholds (animate via `anim`).
- **RT distribution** — correct↑/error↓ histogram, accumulated over trials (right-skew).
- **Phase plane + energy landscape** (2-D circuits) — where the attractor/saddle is.
- **Psychometric / chronometric** — accuracy & mean RT vs coherence (sweep, static).

## Code
```js
let s={S1:0.1,S2:0.1,In1:0,In2:0};                       // Wong–Wang reduced
const r = MSLIB.decision.wwStep(s, {coh:25.6}, 0.0005, ()=>SIM.gaussian(rng));  // {r1,r2}
// decide: r.r1>15 → unit 1 ; r.r2>15 → unit 2
const x2 = MSLIB.sde.wiener(x, A, c, dt, ()=>SIM.gaussian(rng));               // abstract DDM
```

## Sources
Wong & Wang 2006 (`xjwanglab/wong-wang-2006`; `AmazingAng/Decision-Making-Network`) ·
Usher & McClelland 2001 · Bogacz et al. 2006 (model relationships & optimality) ·
Gerstner *Neuronal Dynamics* ch.12 exercise.
