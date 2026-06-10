# Vision & layered sensory models

**Reach for it when** the input is an **image** and the model is a feature hierarchy — early
vision (retina → LGN → V1), oriented-filter / energy models, or a CNN-style stack. **Show the
architecture first** (the layers and their receptive fields), then how an input image is
transformed layer by layer, then how the readout changes with the parameters and connectivity.

## Canonical forms

- **Oriented-energy V1 model** (template exemplar `vision`). A bank of oriented Gabor channels
  (quadrature pairs: energy = even² + odd²) filters the image; pooling across channels gives an
  orientation tuning curve whose population-vector peak is the decoded orientation. Contrast and
  noise set tuning sharpness and decode accuracy.
- **Center-surround / DoG front end** (retina/LGN; compose by hand). Difference-of-Gaussians
  receptive fields (bipolar/horizontal-cell antagonism) do contrast normalization and edge
  enhancement before the oriented stage; RF size grows with eccentricity.
- **CNN-style stack** (compose) — conv → nonlinearity → pool, repeated; show each layer's
  feature maps and how tuning/invariance build with depth.

## Parameters (meaning + typical ranges)

- Stimulus: orientation θ, spatial frequency, contrast (0–1), pixel noise (0–1).
- Architecture: number/bandwidth of channels, RF size, surround strength (center-surround),
  pooling width — vary these to compare how the representation and readout change.

## Angles (structure first)

1. **Architecture** — the filter bank / layer stack and the receptive fields (before any input).
2. **Layers / transform** — one input image transformed stage by stage (channel energy maps, etc.).
3. **Readout** — the decoded feature (tuning curve, class scores) and its accuracy.
4. **Compare** — tuning/accuracy vs contrast, noise, RF size, surround strength, or depth.

## MSLIB / helpers

The template's `vision` model ships inline image helpers (`visScene`, `gaborKernel`, `conv2`,
gray/hot colormaps); draw per-channel/per-layer maps with `g.image` (sub-rect blit) or `g.heat`.
A small `MSLIB.vision` (DoG kernel, RF-size-vs-eccentricity) is a natural addition.

## Sources

Hubel & Wiesel; Adelson & Bergen 1985 (spatiotemporal energy); Carandini & Heeger 2012
(normalization); Rodieck (DoG retina); standard CNN references for the deep-stack variant.
