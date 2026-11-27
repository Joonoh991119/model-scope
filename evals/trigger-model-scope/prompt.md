---
description: A plain-language request for an explorer should load the model-scope skill.
expected_outcome: The model-scope skill is invoked and the reply plans or starts an explorer with a slider per parameter.
tags: [trigger]
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

I have a leaky integrate-and-fire neuron, tau dV/dt = -(V - E_L) + R I, threshold -50 mV, reset -65 mV. I want something I can play with in the browser: change the input current and the noise and see the voltage trace and the f-I curve update. Don't build it yet, just tell me how you would set it up.
