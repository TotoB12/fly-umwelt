// Relative-voltage form of the Shiu et al. whole-brain LIF model.
// v=0 corresponds to -52 mV, threshold=7 mV. The coupled linear ODEs are
// integrated analytically over a step, matching Brian2's `method="linear"`
// passive update more closely than forward Euler.
import {exactLinearCoefficients} from './neural-kernels.js';

export function lifStep(v, g, dtMs, membraneTauMs = 20, synapseTauMs = 5) {
  const {voltageDecay,conductanceDecay,conductanceToVoltage}=exactLinearCoefficients(dtMs,membraneTauMs,synapseTauMs);
  return {v:v*voltageDecay+g*conductanceToVoltage,g:g*conductanceDecay};
}

export function connectionDelta(synapseCount, presynapticSign, weightMv = 0.275) {
  return synapseCount * (presynapticSign < 0 ? -1 : 1) * weightMv;
}
