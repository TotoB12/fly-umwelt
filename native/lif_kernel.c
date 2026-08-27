#include <stdint.h>

// Minimal, deterministic whole-population LIF state updater for WebAssembly.
// Connectivity propagation and sensory transduction remain in inspectable JS;
// this kernel accelerates the O(N) passive dynamics/refractory/threshold pass.

extern unsigned char __heap_base;

static uint32_t neuron_count = 0;
static uint32_t v_offset = 0;
static uint32_t g_offset = 0;
static uint32_t refractory_offset = 0;
static uint32_t spike_offset = 0;

static uint32_t align16(uint32_t value) {
  return (value + 15u) & ~15u;
}

uint32_t abi_version(void) {
  return 1u;
}

uint32_t required_bytes(uint32_t count) {
  uint32_t cursor = align16((uint32_t)(uintptr_t)&__heap_base);
  cursor = align16(cursor + count * (uint32_t)sizeof(float));
  cursor = align16(cursor + count * (uint32_t)sizeof(float));
  cursor = align16(cursor + count * (uint32_t)sizeof(float));
  cursor = align16(cursor + count * (uint32_t)sizeof(uint32_t));
  return cursor;
}

uint32_t init(uint32_t count) {
  uint32_t cursor = align16((uint32_t)(uintptr_t)&__heap_base);
  neuron_count = count;
  v_offset = cursor;
  cursor = align16(cursor + count * (uint32_t)sizeof(float));
  g_offset = cursor;
  cursor = align16(cursor + count * (uint32_t)sizeof(float));
  refractory_offset = cursor;
  cursor = align16(cursor + count * (uint32_t)sizeof(float));
  spike_offset = cursor;
  cursor = align16(cursor + count * (uint32_t)sizeof(uint32_t));
  return cursor;
}

uint32_t ptr_v(void) { return v_offset; }
uint32_t ptr_g(void) { return g_offset; }
uint32_t ptr_refractory(void) { return refractory_offset; }
uint32_t ptr_spikes(void) { return spike_offset; }
uint32_t count_neurons(void) { return neuron_count; }

void clear_state(void) {
  float *v = (float *)(uintptr_t)v_offset;
  float *g = (float *)(uintptr_t)g_offset;
  float *refractory = (float *)(uintptr_t)refractory_offset;
  uint32_t *spikes = (uint32_t *)(uintptr_t)spike_offset;
  for (uint32_t i = 0; i < neuron_count; i++) {
    v[i] = 0.0f;
    g[i] = 0.0f;
    refractory[i] = 0.0f;
    spikes[i] = 0u;
  }
}

uint32_t integrate(float dt_ms,
                   float voltage_decay,
                   float conductance_decay,
                   float conductance_to_voltage,
                   float threshold_mv) {
  float *v = (float *)(uintptr_t)v_offset;
  float *g = (float *)(uintptr_t)g_offset;
  float *refractory = (float *)(uintptr_t)refractory_offset;
  uint32_t *spikes = (uint32_t *)(uintptr_t)spike_offset;
  uint32_t spike_count = 0;

  for (uint32_t i = 0; i < neuron_count; i++) {
    float remaining = refractory[i];
    if (remaining > 0.0f) {
      remaining -= dt_ms;
      refractory[i] = remaining > 0.0f ? remaining : 0.0f;
      // Both differential equations in the published Brian2 model use
      // "unless refractory", so v and g are frozen during this interval.
      v[i] = 0.0f;
      continue;
    }

    const float old_g = g[i];
    const float next_v = v[i] * voltage_decay + old_g * conductance_to_voltage;
    g[i] = old_g * conductance_decay;
    v[i] = next_v;
    if (next_v > threshold_mv) spikes[spike_count++] = i;
  }
  return spike_count;
}
