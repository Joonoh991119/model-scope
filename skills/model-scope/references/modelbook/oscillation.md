# Oscillations & synchronization

**Reach for it when** the model is a population of coupled oscillators or a rhythm-generating
circuit — synchronization, phase-locking, neural-mass rhythms, central pattern generators.
The payoff is usually a **transition**: a regime that switches as coupling, spread, or drive
crosses a critical value (mirror the SIR / epidemic-threshold idiom).

## Canonical forms

- **Kuramoto coupled oscillators** (template exemplar `kuramoto`). N phases θ_i with natural
  frequencies ω_i, mean-field coupling: `dθ_i/dt = ω_i + K·r·sin(ψ − θ_i)`, where the order
  parameter `r·e^{iψ} = (1/N) Σ_j e^{iθ_j}` measures global synchrony (r=0 incoherent, r=1
  locked). Synchrony emerges above a critical coupling `K_c ≈ 2/(π·g(0))` set by the spread
  of natural frequencies g (for a Gaussian spread σ, K_c ≈ 1.6σ).
- **Wilson–Cowan E-I oscillator** (template exemplar `wilson`). Coupled excitatory/inhibitory rate
  equations with a sigmoid nonlinearity: `τ_E dE/dt = −E + S(w_EE·E − w_EI·I + P)`, similarly for I.
  Recurrent excitation + slower delayed inhibition produce a limit cycle past a **Hopf bifurcation**.
  Shows the E/I circuit, the E and I traces + the phase-plane limit cycle, and the bifurcation as
  drive P grows (flat steady state below a critical drive, a growing oscillation above).

## Parameters (meaning + typical ranges)

- `K` coupling strength (0–8) — the order parameter is ~flat below K_c, rises sharply above.
- `spread` σ of natural frequencies (0.2–3) — wider spread ⇒ larger K_c (harder to synchronise).
- `noise` phase noise (0–1) — washes out partial synchrony.

## Angles (structure first)

1. **Structure** — the natural-frequency distribution and the coupling (and its critical K_c).
2. **Dynamics** — the phases on a unit circle bunching (synchronised) or spreading (incoherent);
   the order parameter r(t) building up.
3. **Sync (compare)** — steady-state r vs coupling K: the synchronization transition.

## MSLIB (`osc`)

`kuramotoOrder(phases)` → {r, ψ}; `kuramotoStep(phases, omega, K, dt, sigma, g)` mean-field step.
Compose Wilson–Cowan from `sde` (two coupled rate variables + a sigmoid).

## Sources

Kuramoto 1984; Strogatz 2000 (*From Kuramoto to Crawford*); Wilson & Cowan 1972; Breakspear 2017
(neural-mass models). Neuromatch Academy dynamic-networks tutorials.
