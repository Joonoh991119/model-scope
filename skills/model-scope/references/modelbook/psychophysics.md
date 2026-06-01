# Psychophysics — psychometric functions, SDT, scalar timing

**Use for:** detection/discrimination performance, thresholds, bias vs sensitivity, and
behavioural read-outs that sit on top of any of the other families.

## Psychometric function
`P(correct or "yes" | x) = γ + (1−γ−λ)·F((x−μ)/σ)` where `x` is stimulus level, `F` is a
sigmoid (cumulative Gaussian, logistic, or Weibull), `μ` = threshold (PSE), `σ` = inverse
slope (sensitivity), `γ` = guess rate (chance floor), `λ` = lapse rate (attention ceiling).
- Fit μ, σ (and optionally γ, λ) to choice data; threshold = stimulus at a criterion P.

## Signal-detection theory (SDT)
From hit rate `H` and false-alarm rate `F`: `d' = z(H) − z(F)` (sensitivity), criterion
`c = −½(z(H)+z(F))` (bias). Separates *what you can tell apart* from *how you decide*.
ROC = (F,H) as criterion varies; area ≈ Φ(d'/√2).

## Scalar timing (Weber for time)
Duration/magnitude estimation shows **scalar variability**: SD ∝ mean (Weber fraction).
Combine with the Bayesian observer (Weber-scaled σ_m → central tendency) for time-perception
models. Pacemaker–accumulator (SET) is the classic mechanistic alternative.

## Parameters (meaning · typical)
- `μ` threshold / PSE — *point of subjective equality* (stimulus units).
- `σ` slope (inverse) — *sensitivity / discriminability* (smaller = steeper).
- `γ` guess (often 0.5 in 2AFC, 0 in yes/no), `λ` lapse (0–0.1).
- `d', c` (SDT) — sensitivity & bias.
- Weber fraction `w_f` — *scalar variability* (timing/magnitude).

## Recommended views
- **Psychometric curve** P vs stimulus, with data points + threshold marker + ±lapse band.
- **ROC** (H vs F) with the d′ contour.
- **Threshold vs a parameter** (e.g. noise, attention) — a sweep (static curve).
- For timing: **estimate vs interval** (regression to the mean) + SD-vs-mean (scalar).

## Code (`MSLIB.psy`)
```js
const P  = MSLIB.psy.psychometric(x, {mu:0, sigma:1, gamma:0.5, lambda:0.02, kind:'normcdf'});
const sd = MSLIB.psy.sdt(hitRate, falseAlarmRate);      // {dprime, criterion}
const z  = MSLIB.sde.normcdf(x);                        // Φ
```

## Sources
Green & Swets 1966 (SDT) · Wichmann & Hill 2001 (psychometric fitting, lapse) · Kingdom &
Prins *Psychophysics* / Palamedes · Gibbon 1977 (scalar timing) · Gardner lab (mgl, SDT/pRF).
