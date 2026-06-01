# Single-neuron & small spiking models

**Use for:** membrane dynamics, first-spike latency, f–I (gain) curves, spike-train
variability, adaptation, the effect of input current / conductance / noise.

## Models (increasing realism)
- **Leaky integrate-and-fire (LIF):** `τ dV/dt = −(V−E_L) + R·I`; spike when `V≥V_th` →
  reset to `V_reset`, refractory `t_ref`. Rheobase `I = (V_th−E_L)/R`. Linear-ish f–I.
- **Exponential IF (EIF/AdEx):** add `+Δ_T·exp((V−V_T)/Δ_T)` for a sharp spike onset (+ an
  adaptation current `w` for AdEx). More realistic threshold & adaptation.
- **Izhikevich:** `v' = 0.04v²+5v+140−u+I`, `u' = a(bv−u)`; if `v≥30`: `v=c, u+=d`. Four
  parameters `(a,b,c,d)` reproduce regular/fast/bursting/chattering spiking cheaply.
- **Hodgkin–Huxley:** conductance-based `C dV/dt = −g_Na m³h(V−E_Na) − g_K n⁴(V−E_K) − g_L(V−E_L) + I`
  with gating ODEs — use when channel biophysics matter (heavier; reference Brian2).

## Parameters (meaning · typical)
- LIF: `τ` membrane time const (10–30 ms), `R` resistance, `V_th, V_reset, E_L` (mV),
  `t_ref` refractory (1–5 ms); input `I` (nA) and noise.
- Izhikevich: `(a,b,c,d)` set the dynamical class (RS `0.02,0.2,−65,8`; FS `0.1,0.2,−65,2`;
  IB `0.02,0.2,−55,4`; CH `0.02,0.2,−50,2`).

## Recommended views
- **Membrane trace** V(t) with the threshold line; mark spikes (`g.line` + `g.vline`s).
- **Spike raster** over trials/neurons (`g.raster`), to see rate & variability.
- **f–I curve** mean rate vs input (`MSLIB.neuron.fI`), the gain — sweep noise to see it
  smooth (mean-driven → fluctuation-driven).
- (network) population rate, or a ring-attractor bump.

## Code (`MSLIB.neuron`)
```js
const s={v:-65, refr:0};                                  // LIF
const spiked = MSLIB.neuron.lifStep(s, I, MSLIB.neuron.LIF_DEFAULT, dt);   // dt in s
const fi = MSLIB.neuron.fI((st,I,dt)=>MSLIB.neuron.lifStep(st,I,null,dt),
                            ()=>({v:-65,refr:0}), Irange, 1e-4, 1.0);       // [{I,rate}]
const z={v:-65,u:-13}; const sp = MSLIB.neuron.izhStep(z, I, MSLIB.neuron.IZH_DEFAULT, dt /*ms*/);
```
Inject noisy input by adding `c·√dt·g()` to `I` each step (an OU current via
`MSLIB.sde.ou` is more realistic). Networks: keep an array of states and a synaptic
gating variable; for conductance-based or large nets, point users to **Brian2**.

## Sources
Gerstner et al. *Neuronal Dynamics* (LIF/EIF/AdEx/HH) · Izhikevich 2003/2007 ·
`brian-team/brian2` `examples/frompapers` · `aesagtekin/Hodgkin-Huxley-Model-in-Brian2`.
