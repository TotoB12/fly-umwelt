# Scientific model

## The question

Fly Umwelt asks a constrained question:

> What behavior can arise when a persistent model based on a fly connectome receives only embodied sensory signals, while missing body and ongoing-state biology is added as clearly labelled models?

It does not claim to recreate a living biological fly.

## Measured or annotation-derived components

- neuron identities from the selected connectome pack;
- weighted neuron-pair connectivity;
- predicted presynaptic transmitter classes;
- available sensory, central, descending and motor annotations;
- anatomical side when present.

## Neural equations

Each loaded node keeps:

- membrane potential relative to rest;
- synaptic state;
- refractory state;
- delayed input.

The default numerical constants follow the published whole-brain LIF model approximately:

- rest/reset: `-52 mV`;
- threshold: `-45 mV`, represented as `7 mV` above rest;
- membrane time constant: `20 ms`;
- synaptic time constant: `5 ms`;
- refractory period: `2.2 ms`;
- delay target: about `1.8 ms`;
- base contribution per biological synapse: `0.275 mV` before model scaling.

Connection sign comes from the predicted presynaptic transmitter. This remains an approximation because receptor identity and many modulatory effects are not contained in the wiring graph.

## Sensory transduction

The virtual body supplies local signals rather than world facts.

### Vision

A 270° horizontal retina casts 64 angular samples. Each sample reports brightness, temporal motion, looming and nearby-object proximity. Natural mode distributes these signals over deterministic visual populations when exact receptive fields are unavailable.

### Olfaction

Two virtual antennae sample food volatile, humidity/water and aversive channels. Exact odor-receptor identity is incomplete in the packaged annotations, so Natural and Connectome modes can use disclosed deterministic partitions of olfactory afferents.

### Touch and taste

Contact activates local mechanosensory channels. Food or water can be consumed only when physical contact, taste and ingestion-related output coincide.

### Internal state

Energy, hydration, fatigue, stress and sleep pressure are modeled physiology. Natural and Connectome modes can stimulate bounded endocrine/interoceptive populations. Evoked mode does not.

## Ongoing state

A connectome does not contain the living membrane state of the animal that was imaged. Natural and Connectome modes therefore add disclosed stochastic background events to non-output central neurons. Natural mode also uses weak homeostatic rate control.

Evoked mode adds no spontaneous drive and can remain silent.

## Movement

The body is planar. It does not simulate six articulated legs.

The VNC/body model receives neural evidence and creates locomotor primitives:

- straight walking bouts;
- pauses;
- brief saccadic turns;
- reverse-and-turn contact escape;
- feeding or drinking when taste and neural output agree.

Natural mode uses stochastic finite saccades whose direction can be biased by neural odor and visual evidence. It does not continuously rotate toward a source.

## Memory

The memory layer is a hypothesis, not a readout of known synaptic memory state. It integrates self-motion with accumulating drift. Reward and threat create fading traces. The resulting cue is body-relative and can be injected into selected central-complex or proxy central populations.

Connectome and Evoked modes disable that input.

## The three conditions

### Natural

Whole graph + ongoing-state hypothesis + physiology + memory + modeled VNC. Best autonomous behavior, most added assumptions.

### Connectome

Whole graph + reduced ongoing-state hypothesis + modeled VNC. No spatial-memory input and less functional interpretation.

### Evoked

Whole graph + sensory/experimental stimulation + strict named output bridge. No ongoing-state hypothesis. Closest to the published activation/silencing use case.

## What remains missing

- exact neuron-specific membrane parameters;
- receptor distributions and synaptic kinetics;
- electrical synapses and many neuropeptides;
- glial effects;
- real initial membrane and molecular state;
- complete peripheral nervous system in FAFB;
- detailed muscles, legs, wings and metabolism;
- validated whole-animal synaptic plasticity.

The model has no privileged knowledge that it is software, but this does not demonstrate subjective experience.
