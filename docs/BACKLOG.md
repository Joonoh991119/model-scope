# Backlog: models not built yet

Canonical models that ccn-sim does not ship yet. Each entry names the original paper, the
[modelbook](../skills/ccn-sim/references/modelbook/INDEX.md) family it would join, and the views that would make it
intuitive. To build one, run `/ccn-sim:from-paper` on the paper, then add the finished entry to
`examples.js` with a check in `examples.checks.mjs`. Remove the row here in the same pull request.

## Learning & reinforcement

| Model | Family · library | Views to build | Original paper |
|---|---|---|---|
| **TD learning** | reinforcement-learning · `rl` | one TD update (δ = r + γV′ − V); value spreading back along a chain over trials; δ moving from reward to cue | Sutton (1988) |
| **Dopamine reward-prediction error** | reinforcement-learning · `rl` | δ(t) per trial before / after learning; reward omitted → negative dip at the expected time | Schultz, Dayan & Montague (1997) |
| **Q-learning** | reinforcement-learning · `rl` | Q table on a grid world; ε-greedy path per episode; return vs episode | Watkins & Dayan (1992) |
| **Actor-critic** | reinforcement-learning · `rl` | critic value and actor policy side by side; the TD error driving both; learning curve | Barto, Sutton & Anderson (1983) |
| **Successor representation** | reinforcement-learning · `rl` | M matrix as a heatmap; value = M·r; revaluation when the reward moves | Dayan (1993) |
| **Volatility & learning rate** | belief-tracking · `belief` | reward stream with stable / volatile blocks; learning rate tracking volatility | Behrens et al. (2007) |
| **Hierarchical Gaussian filter** | belief-tracking · `belief` | three-level beliefs over trials; precision-weighted prediction errors | Mathys et al. (2011) |

## Perception & inference

| Model | Family · library | Views to build | Original paper |
|---|---|---|---|
| **Predictive coding** | vision · `vision` | hierarchy structure first; prediction vs error units per layer; end-stopping as the stimulus lengthens | Rao & Ballard (1999) |
| **Sparse coding** | vision · `vision` | learned basis functions emerging from patches; sparsity vs reconstruction error | Olshausen & Field (1996) |
| **Divisive normalization** | psychophysics · `psy` | contrast response with and without the normalization pool; cross-orientation suppression | Carandini & Heeger (2012) |
| **Normalization model of attention** | psychophysics · `psy` | stimulus drive, attention field, suppressive drive, population response; contrast-gain vs response-gain | Reynolds & Heeger (2009) |

## Decision

| Model | Family · library | Views to build | Original paper |
|---|---|---|---|
| **Leaky competing accumulator** | decision-circuits · `decision` | accumulators racing with leak and inhibition; RT distributions; primacy vs recency | Usher & McClelland (2001) |

## Networks & plasticity

| Model | Family · library | Views to build | Original paper |
|---|---|---|---|
| **Boltzmann machine** | network · `network` | units and symmetric weights first; Gibbs sampling over states; energy and the learned distribution vs temperature | Ackley, Hinton & Sejnowski (1985) |
| **STDP** | network · `network` | the STDP window; weight distribution becoming bimodal; input correlations selected | Song, Miller & Abbott (2000) |
| **Oja's rule** | network · `network` | weight vector converging to the first principal component of the input cloud | Oja (1982) |
| **Grid-cell continuous attractor** | network · `network` | connectivity first; activity bump lattice; path integration error vs noise | Burak & Fiete (2009) |

## Neurons

| Model | Family · library | Views to build | Original paper |
|---|---|---|---|
| **Hodgkin–Huxley** | spiking-neurons · `neuron` | V(t) with m, h, n gates; ionic currents per spike; f–I curve and refractoriness | Hodgkin & Huxley (1952) |
| **Izhikevich neuron** | spiking-neurons · `neuron` (`izhStep` exists) | (a, b, c, d) presets: regular, bursting, chattering, fast-spiking; the (v, u) phase plane | Izhikevich (2003) |

## References

- Ackley, D. H., Hinton, G. E., & Sejnowski, T. J. (1985). A learning algorithm for Boltzmann machines. *Cognitive Science, 9*(1), 147–169. [doi:10.1207/s15516709cog0901_7](https://doi.org/10.1207/s15516709cog0901_7)
- Barto, A. G., Sutton, R. S., & Anderson, C. W. (1983). Neuronlike adaptive elements that can solve difficult learning control problems. *IEEE Transactions on Systems, Man, and Cybernetics, SMC-13*(5), 834–846. [doi:10.1109/TSMC.1983.6313077](https://doi.org/10.1109/TSMC.1983.6313077)
- Behrens, T. E. J., Woolrich, M. W., Walton, M. E., & Rushworth, M. F. S. (2007). Learning the value of information in an uncertain world. *Nature Neuroscience, 10*(9), 1214–1221. [doi:10.1038/nn1954](https://doi.org/10.1038/nn1954)
- Burak, Y., & Fiete, I. R. (2009). Accurate path integration in continuous attractor network models of grid cells. *PLoS Computational Biology, 5*(2), e1000291. [doi:10.1371/journal.pcbi.1000291](https://doi.org/10.1371/journal.pcbi.1000291)
- Carandini, M., & Heeger, D. J. (2012). Normalization as a canonical neural computation. *Nature Reviews Neuroscience, 13*(1), 51–62. [doi:10.1038/nrn3136](https://doi.org/10.1038/nrn3136)
- Dayan, P. (1993). Improving generalization for temporal difference learning: The successor representation. *Neural Computation, 5*(4), 613–624. [doi:10.1162/neco.1993.5.4.613](https://doi.org/10.1162/neco.1993.5.4.613)
- Hodgkin, A. L., & Huxley, A. F. (1952). A quantitative description of membrane current and its application to conduction and excitation in nerve. *Journal of Physiology, 117*(4), 500–544. [doi:10.1113/jphysiol.1952.sp004764](https://doi.org/10.1113/jphysiol.1952.sp004764)
- Izhikevich, E. M. (2003). Simple model of spiking neurons. *IEEE Transactions on Neural Networks, 14*(6), 1569–1572. [doi:10.1109/TNN.2003.820440](https://doi.org/10.1109/TNN.2003.820440)
- Mathys, C., Daunizeau, J., Friston, K. J., & Stephan, K. E. (2011). A Bayesian foundation for individual learning under uncertainty. *Frontiers in Human Neuroscience, 5*, 39. [doi:10.3389/fnhum.2011.00039](https://doi.org/10.3389/fnhum.2011.00039)
- Oja, E. (1982). Simplified neuron model as a principal component analyzer. *Journal of Mathematical Biology, 15*(3), 267–273. [doi:10.1007/BF00275687](https://doi.org/10.1007/BF00275687)
- Olshausen, B. A., & Field, D. J. (1996). Emergence of simple-cell receptive field properties by learning a sparse code for natural images. *Nature, 381*(6583), 607–609. [doi:10.1038/381607a0](https://doi.org/10.1038/381607a0)
- Rao, R. P. N., & Ballard, D. H. (1999). Predictive coding in the visual cortex: A functional interpretation of some extra-classical receptive-field effects. *Nature Neuroscience, 2*(1), 79–87. [doi:10.1038/4580](https://doi.org/10.1038/4580)
- Reynolds, J. H., & Heeger, D. J. (2009). The normalization model of attention. *Neuron, 61*(2), 168–185. [doi:10.1016/j.neuron.2009.01.002](https://doi.org/10.1016/j.neuron.2009.01.002)
- Schultz, W., Dayan, P., & Montague, P. R. (1997). A neural substrate of prediction and reward. *Science, 275*(5306), 1593–1599. [doi:10.1126/science.275.5306.1593](https://doi.org/10.1126/science.275.5306.1593)
- Song, S., Miller, K. D., & Abbott, L. F. (2000). Competitive Hebbian learning through spike-timing-dependent synaptic plasticity. *Nature Neuroscience, 3*(9), 919–926. [doi:10.1038/78829](https://doi.org/10.1038/78829)
- Sutton, R. S. (1988). Learning to predict by the methods of temporal differences. *Machine Learning, 3*(1), 9–44. [doi:10.1007/BF00115009](https://doi.org/10.1007/BF00115009)
- Usher, M., & McClelland, J. L. (2001). The time course of perceptual choice: The leaky, competing accumulator model. *Psychological Review, 108*(3), 550–592. [doi:10.1037/0033-295X.108.3.550](https://doi.org/10.1037/0033-295X.108.3.550)
- Watkins, C. J. C. H., & Dayan, P. (1992). Q-learning. *Machine Learning, 8*(3–4), 279–292. [doi:10.1007/BF00992698](https://doi.org/10.1007/BF00992698)
