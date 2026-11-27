---
type: llm
focus: { source: file, path: lif-sim/engine.js }
---

PASS if engine.js registers a model in MODELS and MODEL_ORDER whose params include an input current with range 0 to 3 and a noise sigma with range 0 to 5, whose simulate() integrates the given LIF equation with threshold -50 and reset -65, and whose views include a voltage trace and an f-I curve.
FAIL if any of these is missing or the equation differs from the one given.
