# GUI QC — the gate before you ship a model-scope app

Every build passes this before you call it done. Three stages: **static → visual → review.**
Re-run stages 1–2 after each fix.

## 1. Static gate

```bash
node --check engine.js && node --check plot.js   # syntax
node validate.mjs                                 # every simulate() runs + analytic checks
```

- Every model's `simulate()` returns data without throwing; every view is a function.
- Add **≥1 analytic check per model tied to the science** — a closed-form limit, a monotonic
  trend, a normalisation identity. For a paper, encode its *signatures* (psychometric
  monotonic with 0%→chance; the predicted error structure; a conservation/normalisation the
  equations imply). These are what make the gate meaningful rather than "it ran."

## 2. Visual QC — open `index.html`, screenshot EVERY screen

Walk this checklist on each screen, at the **default** text size **and one larger** size (the
Text-size control reflows fonts/margins — larger text is where overlap shows up).

**No text damage** (the strict one — the user cares about this most):
- [ ] No title clipped at the panel edge. Titles auto-ellipsise to the canvas width, so keep
      the **key word first** ("threshold FIXED — …") — truncation must not be able to hide the point.
- [ ] No text overlapping a graphic (curve / heatmap / bars).
- [ ] No text overlapping other text (labels, legend, ticks, captions).
- [ ] Legends sit on empty space. Use `g.legend(items, {corner:'tl'|'tr'|'bl'|'br'})` to move
      them off the data (ramps plateau top-right → put the legend **top-left**).

**Axes & scales:**
- [ ] Every axis labelled **with units**; reduced-model quantities marked (e.g. "model Hz").
- [ ] Accuracy / probability panels draw a **ceiling (1.0)** line and a **chance** line (1/nAlt),
      and the plotted value is **clamped to `[chance, 1]`** — truncate below chance (it's noise).
- [ ] Never two different units on one y-axis (stack panels with a second `g.frame`).
- [ ] Every heatmap has a `g.colorbar`; category bars use `frame({xticklabels})`.
- [ ] Swept/animated axes are fixed from the **full** result, so curves grow into place
      (no rescaling jitter frame to frame).

**Heavy screens:**
- [ ] The loading overlay appears while computing and clears when done.
- [ ] Switching tab/param mid-compute cancels cleanly — no stale overlay, no interleaved data
      (this is what `window.__simGen` guards in `runChunks`).
- [ ] Views draw a sensible placeholder while `data.loading` is true.

**Story:**
- [ ] Panels are numbered (①②③…) and `blurb`/`note` reference them by number.
- [ ] The paper's thesis is visible: what's held **fixed** looks fixed; what **varies**, varies.

**Angles / lenses (if the model declares `lenses`):** — *lens keys are free; check the angles that fit the model's class.*
- [ ] The level switch shows; each lens binds its own views, and switching is instant (no recompute,
      no stale playhead/overlay).
- [ ] The lenses cover the angles that fit the class (process: process / trial / simulation; decision:
      one trial + histograms by condition; network: structure / activity / representation / landscape;
      vision: architecture / layer transforms), and where there is structure it is shown first.
- [ ] The user can **compare**: a parameter sweep (coloured curves or a heatmap) and, where useful, a
      model toggle, with axes fixed from the full result.
- [ ] A step-level view, if present, decomposes ONE update into named contributions, zoomed so they're comparable.

*How to capture:* a Preview / browser MCP, or `python3 -m http.server` + a headless screenshot.
Trigger a heavy screen and watch the overlay fill then clear; drag a slider fast and confirm no
flicker of stale data.

## 3. Two-axis review pass → fix → re-verify

Get an **independent** review (a second model via the codex MCP, or a strong general model) on
the **two axes a researcher actually judges by**:

- **(A) Scientific-plot readability & interpretability** — units, scales, ceiling/chance lines,
  legends, colour use, anything misleading or hard to read, overlap/clipping.
- **(B) Concept clarity** — do the panels + prose make the key components and the paper's
  **claim↔mechanism mapping** immediately clear to a researcher? Anything redundant,
  jargon-heavy, buried, or unsupported by the model?

Ask for a prioritised **P1→P3** list with the exact file + panel/string + a concrete
replacement. Apply, then re-run stages 1–2. **Two short rounds** (review → fix → re-review)
catches regressions the first round introduces. The **project owner's explicit constraints
override the reviewer** — e.g. "truncate accuracy below chance" stays even if a reviewer
suggests plotting raw values; note the override rather than silently complying.

### Reusable review prompt

> Review this model-scope app (`engine.js` / `plot.js` / `README.md`). It explains **\<paper\>**.
> The thesis it must convey: **\<one sentence\>**. Read each model's `blurb`, `note`, view
> titles, `g.frame({title})` and `g.text` strings — that prose is what teaches.
> Critique on two axes: **(A)** scientific-plot readability/interpretability, **(B)** whether the
> panels + prose make the key components and the claim↔mechanism mapping clear to a researcher.
> Output a prioritised **P1→P3** list: file + panel/string + what's wrong + a concrete fix
> (exact replacement text for prose). Be specific and critical; do not rubber-stamp. Do not edit.
