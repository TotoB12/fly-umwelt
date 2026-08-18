# Research audit

## Anatomical graph

The ready data pack comes from a third-party browser packaging of FlyWire FAFB v783. Fly Umwelt uses the packaged data files, not that project's behavior code. The pack is hash-pinned and visibly distinguishes its edge coverage from the current maximum export.

## Whole-brain dynamics

Shiu et al. provide the precedent for representing every reconstructed neuron as a LIF unit with connectivity-derived weights and predicted transmitter sign. Their work validates selected evoked sensorimotor predictions; it does not supply a continuously autonomous animal.

## Embodiment

NeuroMechFly demonstrates why a nervous system needs explicit sensory transduction, a body, a physical environment and a hierarchy between brain-level decisions and lower motor control. Fly Umwelt keeps the world in 2D to spend computation on neural state and interaction.

## Locomotor design

The previous implementation treated left/right neural asymmetry as continuous angular velocity. That made tiny noisy differences produce circles. The final design uses separate walking and saccadic turning, with stochastic turn occurrence and evidence-biased direction. This follows the qualitative structure reported for freely walking odor navigation while remaining an engineering abstraction.

## Memory

The connectome does not specify the original fly's synaptic memory state. The displayed memory is therefore explicitly a model: noisy self-motion integration plus associative reward/threat traces. It is useful for studying persistent history but is not presented as reconstructed mushroom-body memory.

## Sources

- <https://doi.org/10.1038/s41586-024-07558-y>
- <https://doi.org/10.1038/s41586-024-07763-9>
- <https://doi.org/10.1038/s41592-024-02497-y>
- <https://doi.org/10.7554/eLife.57524>
- <https://doi.org/10.1038/s41586-026-10735-w>
