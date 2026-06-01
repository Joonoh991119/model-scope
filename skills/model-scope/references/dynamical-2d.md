# 2-D phase plane & energy landscape (detail)

For `dim === 2` models, add two views beside the time series: the `(y1,y2)` **phase
plane** (the trial's path as a curve) and — when the deterministic drift is a gradient
field — an **energy landscape** showing where the attractor sits and how it bifurcates.

## Read the deterministic drift generically

The drift `F(y1,y2)` is just `step` with the noise turned off. Make `gaussian` return 0 by
feeding a constant rng (Box–Muller: `u2 = 0.25 → cos(π/2)=0`), then finite-difference:

```js
const ZERO_RNG = () => 0.25;            // ⇒ gaussian(ZERO_RNG) === 0
function fieldAt(model,p,y1,y2){
  const s = model.fieldState ? model.fieldState(p,y1,y2) : {t:0,y1,y2};
  const h=1e-3; model.step(s,p,h,ZERO_RNG); return [(s.y1-y1)/h, (s.y2-y2)/h];   // = F
}
```

`fieldState` lets a model with hidden variables (e.g. a pooled inhibitory population)
project onto `(y1,y2)` by pinning the hidden vars at their quasi-steady-state.

## Fixed point & its type (from the Jacobian)

These linearised models have `F = A·y + b`. Get `A,b` by finite differences at 0, e₁, e₂;
the fixed point is `y* = −A⁻¹b` (when `det A ≠ 0`); classify from `tr A`, `det A`:

- `det ≈ 0, tr ≈ 0` → no isolated fixed point, **uniform drift — no attractor** (race-like).
- `det ≈ 0` → **line attractor** (a neutral direction; the ≈DDM / λ≈0 case).
- `det < 0` → **saddle** (one stable, one unstable direction — pushed to a decision).
- `det > 0, tr < 0` → **stable node — energy well** (an attractor; conservative/slow).

Surface this label in the panel; for competing-accumulator models also show `λ` (e.g.
`λ = w − k` for mutual inhibition, `λ = v − k` for pooled) — the difference variable is an
Ornstein–Uhlenbeck process with that coefficient, and its sign is exactly the bifurcation.

## The potential V (the field is conservative)

For these models `∂F1/∂y2 = ∂F2/∂y1`, so `F = −∇V` for a potential `V`. Build `V` on a
grid by line-integrating `−F` (path-independent):

```js
V[0][0]=0;
for j: V[0][j] = V[0][j-1] - F2(lo, midY2)·dY;          // up the first column
for j: for i: V[i][j] = V[i-1][j] - F1(midY1, y2_j)·dY; // across each row
```

## Colour map — RANK-EQUALISE, yellow = attractor

The critical rendering fix: **do not** scale `V` by plain min–max — a strong input tilt
(`I1,I2`) then dominates and washes the attractor/saddle structure to one colour. Instead
colour by each cell's **percentile rank** of `V`, so the full colour range is always used
and the structure is always visible:

```js
const order=[...V.keys()].sort((a,b)=>V[a]-V[b]);
const rank=new Float64Array(V.length);
for(let r=0;r<order.length;r++) rank[order[r]] = r/(order.length-1);   // 0 = lowest energy
```

Map **rank 0 (low energy = the valley/attractor the flow settles into) → YELLOW**, and
**rank 1 (high energy = the ridge it is pushed away from) → BLUE**, through a light cream
midpoint (a diverging map). This matches intuition: the ball rolls into the yellow well;
the blue ridge is what it leaves. Render the grid to a small off-screen canvas
(`createImageData`) and `drawImage` it scaled with smoothing on.

Overlay: a sparse **vector field** of `F` (cached arrows, scaled by `|F|`); the fixed-point
**marker** (filled dot for a stable node, ✕ for a saddle); dashed thresholds `y1=Z`,
`y2=Z`; the `y1=y2` diagonal reference.

## On the phase plane after the run (bifurcation models)

Once all `n` trials finish, for models *with* a bifurcation (`kind ≠ none`) paint the same
energy colour map across the `(y1,y2)` phase plane and overlay a faint **cloud** of ~70
regenerated decision trajectories — you see the stochastic flow riding the deterministic
landscape into the attractor / decisions. During the per-trial animation keep the phase
plane clean (current trajectory only); reveal the colour map at the final state.

## Cost & caching

Compute `V`, the colour image, the arrows, and the fixed point **once per parameter
change** (cache in state); redraw cheaply each frame. The grid (≈80×80) and a sort of
~6400 cells are sub-millisecond, so recomputing on every slider move is fine.
