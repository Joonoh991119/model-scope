# Recurrent networks & plasticity

**Reach for it when** the model is a recurrent circuit whose *connectivity* carries the
computation — associative memory, attractor dynamics, winner-take-all, or any model where a
learning rule writes structure into the weights. **Show the structure first** (the weight
matrix / wiring / E-I split), then the activity it produces, then how it changes with the
parameters or the learning rule.

## Canonical forms

- **Hopfield associative memory** (template exemplar `hopfield`). Store P binary patterns
  ξ^p ∈ {−1,+1}^N by Hebbian plasticity into a symmetric weight matrix with zero diagonal:
  `W_ij = (1/P) Σ_p ξ_i^p ξ_j^p`. Recall runs asynchronous sign updates
  `s_i ← sign(Σ_j W_ij s_j)`, which never increase the Lyapunov energy
  `E = −½ Σ_ij W_ij s_i s_j` — so the state rolls downhill into a stored pattern (an
  attractor). Capacity is finite: above ≈ **0.138·N** stored patterns the memories interfere
  and recall breaks down.
- **Continuous attractor / ring** (template exemplar `ring`). Mexican-hat connectivity
  (local excitation + broad inhibition) sustains a bump of activity that codes a continuous
  variable (head direction, spatial WM); the bump persists after the cue is gone (working
  memory) and its population-vector peak is the represented value. Strong inhibition sharpens
  the bump; too little floods the ring, too much kills it.
- **Wong–Wang reduced decision circuit** — see [decision-circuits.md](decision-circuits.md)
  (template exemplar `attractor`): two pools, self-excitation vs cross-inhibition, two basins.

## Parameters (meaning + typical ranges)

- `nStore` patterns to store (load) — capacity is ≈0.14·N, so for N=64 reliable recall holds to ~8.
- `cueFlip` cue corruption (fraction of bits flipped, 0–0.5) — how far the cue starts from a memory.
- For attractor/ring variants: recurrent gain, inhibition strength, E/I balance, input drive.

## Angles (structure first)

1. **Structure** — the weight matrix `W` as a (diverging) heatmap, or the connectivity graph /
   E-I split; state the learning rule. *The memories ARE the connectivity.*
2. **Store / learn** — the stored patterns, or the weights accumulating as the plasticity rule runs.
3. **Dynamics / recall** — a cue or initial state settling, update by update, into an attractor;
   overlap-with-target rising, energy falling.
4. **Compare** — capacity vs load (the ≈0.14·N cliff), recall vs cue noise, or the E/I sweep.

## MSLIB (`network`)

`hopfieldStore(patterns, N)` → W; `hopfieldStep(W, s, N, order)` one async sweep;
`hopfieldEnergy(W, s, N)` Lyapunov energy; `overlap(a, b, N)` ∈ [−1,1]. Compose a ring/continuous
attractor from a Mexican-hat kernel + a rate update (reuse `sde`/`neuron`).

## Sources

Hopfield 1982; Amit *Modeling Brain Function*; Hertz–Krogh–Palmer. Ring/bump attractors:
Ben-Yishai et al. 1995, Compte et al. 2000. Brian2 `examples/frompapers` for recurrent nets.
