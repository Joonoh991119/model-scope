# Visual working memory & mixture models

**Use for:** continuous-report recall (orientation, colour, location), set-size effects,
precision vs capacity, **swap/misbinding** errors, and decomposing a report-error
distribution into target + non-target + guess components. A natural **process-mode**
(`stages`) model: *allocate → encode → maintain → probe → recall → accumulate → decompose*.
The template's `wm` model is a worked instance. Angles in **radians on (−π,π]**.

## Mixture models of recall error `e = θ̂ − θ_target`
- **2-component (Zhang & Luck 2008):** `P(e) = (1−g)·VM(e;0,κ) + g·(1/2π)` — a von Mises
  target component + uniform guessing. `g` = guess rate, `1−g` = prob. in memory `Pm`.
- **3-component swap model (Bays, Catalao & Husain 2009):** adds misbinding —
  `P(e) = α·VM(e;0,κ) + β·(1/m)Σ_i VM(e;φ_i,κ) + γ·(1/2π)`, `α+β+γ=1`, where `φ_i` are the
  non-target offsets and `m` their count. `α`=target, `β`=swap, `γ`=guess.
- **von Mises:** `VM(x;μ,κ)=exp(κcos(x−μ))/(2π I0(κ))`; compute `log I0` in log-space (use the
  scaled Bessel for large κ) to avoid overflow.

## Resource, precision & capacity
- **Slots + averaging (Zhang & Luck):** `Pm = K/N` for `N>K` (so `g = 1−K/N`), with **SD
  roughly constant** above capacity `K≈2–4` — discrete fixed resolution.
- **Continuous resource (Bays & Husain 2008):** precision `= 1/SD`, resource `R=1/N` (equal
  allocation, attention can bias it), **power law** `P(N) = P1·N^(−k)`, `k = 0.74 ± 0.06` — a
  smooth decline, *no* discontinuity at N≈4 (the slots-vs-resource contrast to expose).
- **κ ↔ spread:** `SD = √(−2 ln(I1(κ)/I0(κ)))`; Fisher info `J = κ·I1(κ)/I0(κ)`; large κ:
  `SD ≈ 1/√κ`, precision `≈ √κ`.

## Parameters (meaning · typical)
- `κ` concentration / precision (3–60; higher = sharper) — *encoding quality*.
- `N` set size (1–8), `m=N−1` non-targets.
- `β` swap rate (0–0.4, **rises with N** — crowding) · `γ` guess rate (0–0.3, rises with N).
- `K` slot capacity (2–4); delay (longer → ↓precision, ↑swaps).

## Process pipeline (stages) & recommended views
1. **allocate** resource → precision per item (allocation bars / the `P∝N^−0.74` curve); 2.
**encode** the array on a **feature wheel** (each item a dot with a spread arc ∝ 1/√κ); 3.
**maintain** over a delay; 4. **probe** one item (target) — others become swap candidates; 5.
**recall draw** (a needle, coloured by branch: target/swap/guess); 6. **accumulate** the
report-error **histogram** over trials; 7. **decompose** — overlay `α·VM + β·swap + γ·uniform`.
(For a clean demo, fix non-target offsets evenly so swap bumps sit at known angles.)

## Code (`MSLIB.wm`)
```js
const r  = MSLIB.wm.mixtureRecall({target, nontargets, kappa, pT, pSwap, pGuess}, ()=>rng());
// r = {thetaHat, branch:'target'|'swap'|'guess'}   (2-comp = pSwap:0, nontargets:[])
const e  = MSLIB.wm.wrap(r.thetaHat - target);
const pdf= MSLIB.wm.mixturePdf(e, {kappa, pT, pSwap, pGuess, nontargetOffsets:offs});
const sd = MSLIB.wm.kappaToSD(kappa);                  // circular SD; sdToKappa is the inverse
const P  = MSLIB.wm.precisionFromSetsize(N, {k:0.74}); // shared-resource power law
const s  = MSLIB.wm.vmSample(mu, kappa, ()=>rng());    // Best–Fisher 1979 sampler
```
`vmSample` and the conversions are transcribed verbatim from MemToolbox; `I0`/`I1` use a
series for κ<15 and an asymptotic form above. To match the MATLAB toolboxes (degrees on
[−180,180]) convert SDs and render histograms in degrees.

## Fit to data
`visionlab/MemToolbox` (MATLAB, the reference: `StandardMixtureModel`, `SwapModel`,
`SlotsPlusAveragingModel`) · Paul Bays' Analogue Report Toolbox (`mixtureFit`, JV10) ·
`JimGrange/mixtur` & `eddjberry/mixturer` (R). EM / max-likelihood over the same components.

## Sources
Zhang & Luck 2008 *Nature* · Bays & Husain 2008 *Science*; Bays, Catalao & Husain 2009 *J Vis*
· Suchow, Brady, Fougnie & Alvarez 2013 *J Vis* (MemToolbox) · Schneegans, Taylor & Bays 2020
*PNAS* (sampling account) · Best & Fisher 1979 (von Mises sampler).
