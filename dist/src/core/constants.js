export const APP_VERSION = '3.0.0';

// The body is integrated at 100 Hz. Sensory packets and neural decisions are
// exchanged at 20 Hz, while the main thread renders at the display refresh rate.
export const WORLD_DT = 0.01;
export const SENSOR_DT = 0.05;
export const SNAPSHOT_HZ = 25;
export const RETINA_RAYS = 64;
export const RETINA_FOV = Math.PI * 1.5; // 270° horizontal field, matching FlyGym's calibrated view.
export const MAX_RAY_DISTANCE = 45;
export const FLY_RADIUS = 1.55;
export const ANTENNA_OFFSET = 1.6;
export const ANTENNA_SEPARATION = 0.68;
export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
export const MAX_STEPS_PER_PUMP = 180;
export const SAVE_DB = 'fly-umwelt-organisms-v1';

export const OUTPUT_FLAGS = Object.freeze({
  LEFT: 1 << 0,
  RIGHT: 1 << 1,
  DESCENDING: 1 << 2,
  PROBOSCIS_MOTOR: 1 << 3,
  LEG_MOTOR: 1 << 4,
  PROXY_LEFT: 1 << 5,
  PROXY_RIGHT: 1 << 6,
});

// Narrow, annotation-derived output populations. These labels are useful when
// present, but the natural mode does not pretend that an incomplete brain-only
// volume contains a complete VNC and muscle command stream.
export const OUTPUT_POPULATION_SPECS = Object.freeze([
  {name:'oDN1', bit:8, pattern:/(^|[^a-z0-9])o?dn1([^a-z0-9]|$)/i, role:'forward'},
  {name:'DNa02', bit:9, pattern:/(^|[^a-z0-9])dna02([^a-z0-9]|$)/i, role:'steering'},
  {name:'DNa01', bit:10, pattern:/(^|[^a-z0-9])dna01([^a-z0-9]|$)/i, role:'steering'},
  {name:'MDN', bit:11, pattern:/(^|[^a-z0-9])mdn([^a-z0-9]|$)|moonwalker/i, role:'reverse'},
  {name:'DNg13', bit:12, pattern:/(^|[^a-z0-9])dng13([^a-z0-9]|$)/i, role:'turning-stride'},
  {name:'P9', bit:13, pattern:/(^|[^a-z0-9])p9([^a-z0-9]|$)/i, role:'forward-mode'},
  {name:'BPN', bit:14, pattern:/(^|[^a-z0-9])bpn([^a-z0-9]|$)|bolt.?protocerebral/i, role:'forward-mode'},
  {name:'DNp09', bit:15, pattern:/(^|[^a-z0-9])dnp09([^a-z0-9]|$)/i, role:'forward-context'},
  {name:'giant_fiber', bit:16, pattern:/giant.?fiber|(^|[^a-z0-9])gf([^a-z0-9]|$)/i, role:'startle'},
  {name:'MN9', bit:17, pattern:/(^|[^a-z0-9])mn9([^a-z0-9]|$)/i, role:'proboscis'},
  {name:'water_motor', bit:18, pattern:/water.*(motor|ingest)|ingest.*water|drinking/i, role:'drinking'},
  {name:'leg_motor', bit:19, pattern:/leg.*motor|motor.*leg|tars(us|al).*motor|femur.*motor|tibia.*motor/i, role:'vnc-leg'},
  {name:'backward_motor', bit:20, pattern:/backward.*motor|motor.*backward|reverse.*motor/i, role:'vnc-reverse'},
  {name:'halt', bit:21, pattern:/(^|[^a-z0-9])brk([^a-z0-9]|$)|brake|halt|stop.?neuron/i, role:'halt'},
  {name:'DNg_walk', bit:22, pattern:/(^|[^a-z0-9])dng(?!13)[a-z0-9]*([^a-z0-9]|$)|walking.?dn/i, role:'walking'},
  {name:'DNp42', bit:23, pattern:/(^|[^a-z0-9])dnp42([^a-z0-9]|$)/i, role:'reverse-associated'},
]);

export const NAMED_OUTPUT_MASK = OUTPUT_POPULATION_SPECS.reduce((mask, spec) => mask | (1 << spec.bit), 0) >>> 0;
export const ANY_OUTPUT_MASK = (OUTPUT_FLAGS.DESCENDING | OUTPUT_FLAGS.PROBOSCIS_MOTOR | OUTPUT_FLAGS.LEG_MOTOR | NAMED_OUTPUT_MASK) >>> 0;

export const MODEL_PRESETS = Object.freeze({
  // Best-looking and most useful closed-loop experiment. The measured brain graph
  // always runs; missing ongoing state, VNC reflexes and body mechanics are explicit models.
  natural: Object.freeze({
    modelMode:'natural',
    brainDtMs:2,
    synapticDelayMs:1.8,
    sensoryGain:1.12,
    sensoryEventMultiplier:250,
    visualTransduction:'feature-assisted',
    retinalMapping:'sector-proxy',
    chemicalMapping:'proxy',
    allowSyntheticReceptorFallback:true,
    interoception:true,
    interoceptionMapping:'proxy',
    memoryInput:true,
    spontaneousSeedFraction:0.007,
    spontaneousSeedRateHz:9,
    spontaneousSeedEventMv:8.2,
    backgroundSynapticRateHz:34,
    backgroundSynapticEventMv:0.42,
    warmupMs:450,
    autonomyDrive:0.82,
    homeostasis:true,
    targetPopulationRateHz:0.45,
    outputGain:1.45,
    strictDecoder:false,
    broadDescendingGain:0.9,
    allowOutputSideProxy:true,
    useSubthresholdOutput:true,
    subthresholdOutputGain:9,
    functionalIntent:true,
    vncProfile:'natural',
  }),

  // Connectome-dominant mode. It still needs a motor plant, but removes spatial
  // memory and most behavioral priors. Useful for seeing what the graph alone provides.
  connectome: Object.freeze({
    modelMode:'connectome',
    brainDtMs:2,
    synapticDelayMs:1.8,
    sensoryGain:1.0,
    sensoryEventMultiplier:250,
    visualTransduction:'feature-assisted',
    retinalMapping:'sector-proxy',
    chemicalMapping:'proxy',
    allowSyntheticReceptorFallback:true,
    interoception:true,
    interoceptionMapping:'proxy',
    memoryInput:false,
    spontaneousSeedFraction:0.004,
    spontaneousSeedRateHz:6,
    spontaneousSeedEventMv:8.0,
    backgroundSynapticRateHz:20,
    backgroundSynapticEventMv:0.34,
    warmupMs:300,
    autonomyDrive:0.5,
    homeostasis:true,
    targetPopulationRateHz:0.25,
    outputGain:1.2,
    strictDecoder:false,
    broadDescendingGain:0.72,
    allowOutputSideProxy:true,
    useSubthresholdOutput:true,
    subthresholdOutputGain:6,
    functionalIntent:false,
    vncProfile:'direct',
  }),

  // Closest to the published evoked LIF use case: zero spontaneous baseline and
  // named outputs only. It can remain silent or stationary by design.
  evoked: Object.freeze({
    modelMode:'evoked',
    brainDtMs:2,
    synapticDelayMs:1.8,
    sensoryGain:1,
    sensoryEventMultiplier:250,
    visualTransduction:'luminance',
    retinalMapping:'hemifield',
    chemicalMapping:'annotated',
    allowSyntheticReceptorFallback:false,
    interoception:false,
    interoceptionMapping:'annotated',
    memoryInput:false,
    spontaneousSeedFraction:0,
    spontaneousSeedRateHz:0,
    spontaneousSeedEventMv:0,
    backgroundSynapticRateHz:0,
    backgroundSynapticEventMv:0,
    warmupMs:0,
    autonomyDrive:0,
    homeostasis:false,
    outputGain:1.1,
    strictDecoder:true,
    broadDescendingGain:0,
    allowOutputSideProxy:false,
    useSubthresholdOutput:false,
    subthresholdOutputGain:0,
    functionalIntent:false,
    vncProfile:'evoked',
  }),
});

export const MODEL_DEFAULTS = Object.freeze({
  modelMode:'natural',
  brainDtMs:2,
  synapseWeightMv:0.275,
  membraneTauMs:20,
  synapseTauMs:5,
  thresholdMv:7,
  refractoryMs:2.2,
  synapticDelayMs:1.8,
  sensoryGain:1.12,
  sensoryEventMultiplier:250,
  visualTransduction:'feature-assisted',
  retinalMapping:'sector-proxy',
  chemicalMapping:'proxy',
  allowSyntheticReceptorFallback:true,
  interoception:true,
  interoceptionMapping:'proxy',
  memoryInput:true,
  spontaneousSeedFraction:0.007,
  spontaneousSeedRateHz:9,
  spontaneousSeedEventMv:8.2,
  backgroundSynapticRateHz:34,
  backgroundSynapticEventMv:0.42,
  warmupMs:450,
  autonomyDrive:0.82,
  outputGain:1.45,
  steeringSign:1,
  strictDecoder:false,
  broadDescendingGain:0.9,
  allowOutputSideProxy:true,
  useSubthresholdOutput:true,
  subthresholdOutputGain:9,
  homeostasis:true,
  targetPopulationRateHz:0.45,
  functionalIntent:true,
  vncProfile:'natural',
});

export function normalizeModelMode(mode) {
  if (mode === 'published') return 'evoked';
  if (mode === 'embodied' || mode === 'interactive') return 'natural';
  return MODEL_PRESETS[mode] ? mode : 'natural';
}

export function modelConfigFor(mode='natural', overrides={}) {
  const normalized = normalizeModelMode(mode);
  return {...MODEL_DEFAULTS, ...MODEL_PRESETS[normalized], ...overrides, modelMode:normalized};
}

export const OBJECT_KINDS = Object.freeze({
  wall: {label:'Wall', shape:'rect'},
  shelter: {label:'Shelter', shape:'rect'},
  food: {label:'Food', shape:'circle'},
  water: {label:'Water', shape:'circle'},
  light: {label:'Light', shape:'circle'},
  threat: {label:'Moving threat', shape:'circle'},
});

export const SOURCE_URLS = Object.freeze({
  natureConnectome:'https://doi.org/10.1038/s41586-024-07558-y',
  natureModel:'https://doi.org/10.1038/s41586-024-07763-9',
  natureBanc:'https://doi.org/10.1038/s41586-026-10735-w',
  natureFlyGym:'https://doi.org/10.1038/s41592-024-02497-y',
  flywireCodex:'https://codex.flywire.ai/',
  referenceRepo:'https://github.com/snedea/flybrain',
});
