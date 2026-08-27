/**
 * Frozen free-walking constraints and explicitly separate engineering bridges.
 * The browser constants mirror public/data/calibration/locomotor-competence-v1.json.
 */
export const LOCOMOTOR_CALIBRATION=Object.freeze({
  schema:'fly-umwelt-locomotor-honesty-v1',
  evidence:Object.freeze({
    straightBoutSpeedMinMmPerSecond:7.2,
    straightBoutSpeedMaxMmPerSecond:44.7,
    representativeSpeedMmPerSecond:28,
    activeJointCycleMinHz:10,
    activeJointCycleMaxHz:20,
    plateauStepPeriodSeconds:.06,
    plateauStepFrequencyHz:1/.06,
    representativeAdvancePerCycleMm:28*(.06),
    slowMotorRestingRateHz:30,
  }),
  engineering:Object.freeze({
    // Identified BANC leg pools are far below the homogeneous 7 mV LIF
    // threshold and currently never spike. Natural/Causal may therefore use
    // their actual normalized subthreshold state through this saturating scale.
    // It is not a measured motor-neuron membrane transfer.
    motorSubthresholdSaturationScale:.16,
    spikeRateSaturationHz:4.2,
    activeFrequencyBaseHz:10,
    coordinationFrequencySpanHz:7,
    motorFrequencySpanHz:3,
    steeringGainRadPerSecond:2.15,
    steeringTractionScale:2,
    ingestionContactThreshold:.05,
    ingestionFulfillmentThreshold:.18,
    probingDisplayThreshold:.35,
  }),
});
