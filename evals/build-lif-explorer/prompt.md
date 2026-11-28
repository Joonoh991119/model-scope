---
description: An end-to-end build in an empty folder, graded by the files produced.
expected_outcome: A ccn-sim app in ./lif-sim with a LIF model added to engine.js, and the gate run.
tags: [build]
max_turns: 60
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Build me an interactive explorer in ./lif-sim for a leaky integrate-and-fire neuron: tau_m dV/dt = -(V - E_L) + R I(t) + sigma sqrt(tau_m) xi(t), with E_L = -65 mV, threshold -50 mV, reset -65 mV, R = 10 MOhm, tau_m = 10 ms. Sliders for the input current I (0 to 3 nA) and the noise sigma (0 to 5 mV). Show the voltage trace and the f-I curve. Only my model, not the gallery of examples. Run its checks before you finish.
