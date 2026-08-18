// Relative-voltage form of the Shiu et al. whole-brain LIF model.
// v=0 corresponds to -52 mV, threshold=7 mV.
export function lifStep(v, g, dtMs, membraneTauMs = 20, synapseTauMs = 5) {
  const dv = ((g - v) / membraneTauMs) * dtMs;
  const dg = (-g / synapseTauMs) * dtMs;
  return {v: v + dv, g: g + dg};
}

export function connectionDelta(synapseCount, presynapticSign, weightMv = 0.275) {
  return synapseCount * (presynapticSign < 0 ? -1 : 1) * weightMv;
}
