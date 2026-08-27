export const APP_VERSION = '3.8.0';

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

export const LEG_IDS = Object.freeze(['LF','LM','LH','RF','RM','RH']);

// Stable supplementary motor-unit channels for the one articulated joint.
// They preserve source identities that are lost when all neurons with the same
// joint action are averaged into the legacy 72-channel actuator packet.
export const FEMUR_TIBIA_MOTOR_UNIT_SPECS = Object.freeze([
  Object.freeze({id:'flexorSlow',label:'flexor slow',action:'femurTibiaFlex'}),
  Object.freeze({id:'flexorUnresolved',label:'flexor unresolved ensemble',action:'femurTibiaFlex'}),
  Object.freeze({id:'flexorFast',label:'flexor fast',action:'femurTibiaFlex'}),
  Object.freeze({id:'extensorSlow',label:'extensor SETi',action:'femurTibiaExtend'}),
  Object.freeze({id:'extensorFast',label:'extensor FETi',action:'femurTibiaExtend'}),
]);

export const legMotorUnitPopulationKey=(legId,unitId)=>`legMotorUnit${legId}${unitId[0].toUpperCase()}${unitId.slice(1)}`;
export const LEG_LABELS = Object.freeze({LF:'left front',LM:'left middle',LH:'left hind',RF:'right front',RM:'right middle',RH:'right hind'});

export const OUTPUT_FLAGS = Object.freeze({
  LEFT: 1 << 0,
  RIGHT: 1 << 1,
  DESCENDING: 1 << 2,
  PROBOSCIS_MOTOR: 1 << 3,
  LEG_MOTOR: 1 << 4,
  PROXY_LEFT: 1 << 5,
  PROXY_RIGHT: 1 << 6,
  LEG_LF: 1 << 24,
  LEG_LM: 1 << 25,
  LEG_LH: 1 << 26,
  LEG_RF: 1 << 27,
  LEG_RM: 1 << 28,
  LEG_RH: 1 << 29,
});

export const LEG_OUTPUT_FLAGS = Object.freeze({
  LF:OUTPUT_FLAGS.LEG_LF, LM:OUTPUT_FLAGS.LEG_LM, LH:OUTPUT_FLAGS.LEG_LH,
  RF:OUTPUT_FLAGS.LEG_RF, RM:OUTPUT_FLAGS.LEG_RM, RH:OUTPUT_FLAGS.LEG_RH,
});

// BANC exposes individual leg motor neurons with peripheral muscle targets and
// a normalized action label. Keep those actions separate instead of reducing
// the complete motor periphery to one value per leg. The current planar body
// uses the femur-tibia antagonist pair first; the remaining channels are
// preserved for the articulated-body replacement.
export const LEG_MOTOR_ACTION_SPECS = Object.freeze([
  Object.freeze({id:'coxaTrochanterExtend',source:'extend_coxa_trochanter_joint',joint:'coxaTrochanter',direction:1}),
  Object.freeze({id:'femurTibiaExtend',source:'extend_femur_tibia_joint',joint:'femurTibia',direction:1}),
  Object.freeze({id:'tibiaTarsusExtend',source:'extend_tibia_tarsus_joint',joint:'tibiaTarsus',direction:1}),
  Object.freeze({id:'coxaTrochanterFlex',source:'flex_coxa_trochanter_joint',joint:'coxaTrochanter',direction:-1}),
  Object.freeze({id:'femurTibiaFlex',source:'flex_femur_tibia_joint',joint:'femurTibia',direction:-1}),
  Object.freeze({id:'tibiaTarsusFlex',source:'flex_tibia_tarsus_joint',joint:'tibiaTarsus',direction:-1}),
  Object.freeze({id:'coxaAnterior',source:'move_coxa_anterior',joint:'coxaYaw',direction:1}),
  Object.freeze({id:'coxaMedial',source:'move_coxa_medial',joint:'coxaRoll',direction:-1}),
  Object.freeze({id:'coxaPosterior',source:'move_coxa_posterior',joint:'coxaYaw',direction:-1}),
  Object.freeze({id:'coxaPosteriorLateral',source:'move_coxa_posterior_lateral',joint:'coxaRoll',direction:1}),
  Object.freeze({id:'longTendonPull',source:'pull_long_tendon',joint:'longTendon',direction:-1}),
  Object.freeze({id:'unknownLegMovement',source:'unknown_leg_movement',joint:'unknown',direction:0}),
]);

export const LEG_MOTOR_ACTION_BY_SOURCE = Object.freeze(Object.fromEntries(LEG_MOTOR_ACTION_SPECS.map((spec,index)=>[spec.source,{...spec,code:index+1}])));
export const legMotorActionPopulationKey=(legId,actionId)=>`legAction${legId}${actionId[0].toUpperCase()}${actionId.slice(1)}`;

export const LEG_SENSORY_MODALITIES = Object.freeze([
  Object.freeze({id:'tactile',bit:1<<0}),
  Object.freeze({id:'proprioception',bit:1<<1}),
  Object.freeze({id:'jointAngle',bit:1<<2}),
  Object.freeze({id:'movementDirection',bit:1<<3}),
  Object.freeze({id:'vibration',bit:1<<4}),
  Object.freeze({id:'strain',bit:1<<5}),
  Object.freeze({id:'nociception',bit:1<<6}),
  Object.freeze({id:'gustatory',bit:1<<7}),
]);

// Narrow, annotation-derived output populations. These labels are useful when
// present, but the natural mode does not pretend that an incomplete brain-only
// volume contains a complete VNC and muscle command stream.
export const OUTPUT_POPULATION_SPECS = Object.freeze([
  // Keep exact named-DN aliases narrow. Optionalizing the leading "o" made
  // oDN1 match unrelated DN1 circadian and lateral-horn types in BANC.
  {name:'oDN1', bit:8, pattern:/(^|[^a-z0-9])odn1([^a-z0-9]|$)/i, role:'forward'},
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
  {name:'halt', bit:21, pattern:/(^|[^a-z0-9])(?:brk|brake|halt|stop(?:ping)?(?:[ _-]?neuron)?)([^a-z0-9]|$)/i, role:'halt', exact:true},
  // DNg is a lineage/name prefix, not a generic walking command. Preserve the
  // compatibility population only for an explicit walking-DN annotation.
  {name:'DNg_walk', bit:22, pattern:/walking.?dn/i, role:'walking'},
  {name:'DNp42', bit:23, pattern:/(^|[^a-z0-9])dnp42([^a-z0-9]|$)/i, role:'reverse-associated'},
]);

export const NAMED_OUTPUT_MASK = OUTPUT_POPULATION_SPECS.reduce((mask, spec) => mask | (1 << spec.bit), 0) >>> 0;
export const ANY_LEG_OUTPUT_MASK = LEG_IDS.reduce((mask,id)=>mask|LEG_OUTPUT_FLAGS[id],0) >>> 0;
export const ANY_OUTPUT_MASK = (OUTPUT_FLAGS.DESCENDING | OUTPUT_FLAGS.PROBOSCIS_MOTOR | OUTPUT_FLAGS.LEG_MOTOR | ANY_LEG_OUTPUT_MASK | NAMED_OUTPUT_MASK) >>> 0;

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
    motorSubthresholdSaturationScale:.16,
    functionalIntent:false,
    vncProfile:'hexapod',
  }),

  // Causal/connectome-dominant mode. It still needs a motor plant, but removes
  // post-connectome sensory steering, spatial memory and most behavioral priors.
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
    motorSubthresholdSaturationScale:.16,
    functionalIntent:false,
    vncProfile:'hexapod',
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
    motorSubthresholdSaturationScale:.16,
    functionalIntent:false,
    vncProfile:'hexapod',
  }),
});

export const MODEL_DEFAULTS = Object.freeze({
  modelMode:'natural',
  brainDtMs:2,
  synapseWeightMv:0.275,
  recurrentGainMv:48,
  edgeWeightSemantics:'manifest',
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
  motorSubthresholdSaturationScale:.16,
  homeostasis:true,
  targetPopulationRateHz:0.45,
  functionalIntent:false,
  vncProfile:'hexapod',
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
