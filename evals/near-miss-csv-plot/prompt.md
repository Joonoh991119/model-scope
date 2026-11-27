---
description: A plain data-plotting request shares words with the skills but must not load either.
expected_outcome: Neither model-scope nor paper-to-sim is invoked; Claude writes a short plotting script for the CSV.
tags: [near-miss]
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill, Write]
---

I have reaction times from my drift-diffusion experiment in rts.csv (columns: subject, coherence, rt, correct). Write me a short Python script that plots the mean RT per coherence level with error bars. Just the script, no app.
