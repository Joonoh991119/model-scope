# Attention & transformers

**Reach for it when** the model routes information by **content** rather than fixed wiring —
self-attention, transformers, content-addressable memory, or any "soft, learned connectivity"
mechanism. **Show the attention matrix first** (who attends to whom — the structure), then how it
re-combines the values, then how a knob (temperature, heads, positional bias) reshapes it.

## Canonical form

- **Single-head self-attention** (template exemplar `attention`). For query i and key j a score
  combines content and position, e.g. `score(i,j) = −contentW·(type_i−type_j)² − posBias·|i−j|`;
  `attention(i,·) = softmax(score / temperature)`; `output_i = Σ_j attention(i,j)·value_j`. Attention
  is a soft, content-based adjacency: each token's output is the attention-weighted mix of the others'
  values. Low temperature → sharp, near-hard routing (copy the best match); high temperature → uniform
  averaging. The standard dot-product form is `softmax(QKᵀ/√d)·V` with learned Q, K, V projections.
- **Multi-head / multi-layer** (compose) — several attention maps in parallel, stacked; show each
  head's matrix and how representations transform with depth (the same idiom, more maps).

## Parameters (meaning + typical ranges)

- `temperature` (softmax) — sharpness of attention (entropy from ~0 to ln N).
- `posBias` — how much position (locality) vs content drives attention.
- For the dot-product form: key/query dimension, number of heads, learned weights.

## Angles (structure first)

1. **Structure** — the attention matrix (query rows × key columns) as a heatmap: who attends to whom.
2. **Mix** — for one query, its attention distribution over keys; and the input values vs the
   attention-mixed outputs (how information is routed and combined).
3. **Compare** — attention entropy (sharpness) vs temperature, or the effect of positional bias / heads.

## MSLIB (`attn`)

`softmax(logits)` (numerically stable, sums to 1) and `entropy(p)` (peakedness, 0 … ln N). Build the
score matrix from the token features, softmax each row, and mix the values — a few lines on top of `attn`.

## Sources

Vaswani et al. 2017 (*Attention Is All You Need*); Bahdanau et al. 2015 (additive attention);
Elhage et al. (*A Mathematical Framework for Transformer Circuits*) for the circuits view. The
content-addressable-memory reading connects to [network.md](network.md) (Hopfield).
