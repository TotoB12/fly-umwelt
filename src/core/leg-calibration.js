const degrees=value=>value*Math.PI/180;

/**
 * Frozen parameters for the adult front-leg femur–tibia preparation.
 * `measured` values are transcribed from the cited primary studies. Values
 * marked `engineering` are bounded browser-model choices, not fitted biology.
 */
export const FRONT_FEMUR_TIBIA_CALIBRATION=Object.freeze({
  schema:'fly-umwelt-front-femur-tibia-v1',
  preparation:'adult Drosophila front-leg femur–tibia joint',
  coordinate:Object.freeze({
    flexionDirection:-1,
    minimumAngleRad:degrees(18),
    neutralAngleRad:degrees(90),
    maximumAngleRad:degrees(180),
    naturalWalkingRangeRad:Object.freeze([degrees(40),degrees(120)]),
  }),
  joint:Object.freeze({
    activeAcceleration:34,
    passiveStiffness:18,
    damping:6,
    maximumVelocityRadPerSecond:degrees(3200),
  }),
  recruitment:Object.freeze({
    slowThreshold:.08,
    intermediateThreshold:.32,
    fastThreshold:.70,
    thresholdRampWidth:.18,
    fastRequiresIntermediate:.42,
    gateMemorySeconds:.030,
  }),
  motorUnits:Object.freeze({
    flexorSlow:Object.freeze({forceGain:.01,riseTauSeconds:.348,fallTauSeconds:.0434,fatigueGain:0}),
    flexorIntermediate:Object.freeze({forceGain:.10,riseTauSeconds:.0123,fallTauSeconds:.025,fatigueGain:.18}),
    flexorFast:Object.freeze({forceGain:1,riseTauSeconds:.0123,fallTauSeconds:.025,fatigueGain:.34}),
    extensorSlow:Object.freeze({forceGain:.16,riseTauSeconds:.12,fallTauSeconds:.08,fatigueGain:0}),
    extensorFast:Object.freeze({forceGain:1,riseTauSeconds:.0123,fallTauSeconds:.025,fatigueGain:.30}),
    fatigueTauSeconds:.42,
    recoveryTauSeconds:1.6,
  }),
  feco:Object.freeze({
    flexionBoundaryRad:degrees(90),
    extensionBoundaryRad:degrees(90),
    // Hook calcium-response slope was reported as similar over the measured
    // speed range. Twenty degrees/s is a disclosed transducer saturation
    // scale, not a measured half-speed or a GCaMP fit.
    hookSpeedHalfRadPerSecond:degrees(20),
    clubPeakSpeedRadPerSecond:degrees(400),
    tonicTauSeconds:.045,
    phasicRiseTauSeconds:.012,
    phasicFallTauSeconds:.060,
    clubAdaptationTauSeconds:.28,
    clubImpactGain:.22,
    clawHistoryGain:.10,
    // Mamiya et al. report slightly weaker club responses at full extension.
    // The paper does not supply a fitted magnitude, so this remains a small,
    // explicitly engineering modulation constrained only in sign.
    clubExtensionAttenuation:.08,
  }),
});

/**
 * Experiment-specific SI bridge for the restrained adult front-leg force-probe
 * preparation. These constants are mirrored by
 * public/data/calibration/front-leg-spike-force-bridge-v1.json and checked by
 * the calibration validator. The probe lever arm is an external observation
 * geometry; it is not an inferred tendon moment arm.
 */
export const FRONT_LEG_SPIKE_FORCE_BRIDGE=Object.freeze({
  schema:'fly-umwelt-front-leg-spike-force-bridge-v1',
  forceProbe:Object.freeze({
    springNewtonsPerMeter:.2234,
    effectiveMassKilograms:1.7e-7,
    dragKilogramsPerSecond:1.4e-4,
    leverArmMeters:417e-6,
    leverArmStandardDeviationMeters:7e-6,
  }),
  morphology:Object.freeze({
    tibiaMassKilograms:2.07e-9,
    tibiaLengthMeters:.000518000894825482,
    tibiaPivotInertiaKilogramMeterSquared:1.8514419965760005e-16,
  }),
  motorUnits:Object.freeze({
    slow:Object.freeze({oneSpikeMicroNewtons:.013,countCurve:'linear',riseTauSeconds:.348,peakSeconds:.75,fallTauSeconds:.10}),
    intermediate:Object.freeze({oneSpikeMicroNewtons:.3687,countCurve:'saturating',riseTauSeconds:.012603899189325862,peakSeconds:.05,fallTauSeconds:.025}),
    fast:Object.freeze({oneSpikeMicroNewtons:7.0382,countCurve:'saturating',riseTauSeconds:.012603899189325862,peakSeconds:.05,fallTauSeconds:.025}),
    summationRetention:.6,
  }),
  gcamp6f:Object.freeze({
    riseTauSeconds:.05,
    fallTauSeconds:.15,
    saturationDrive:.75,
    sampleRateHertz:8.01,
  }),
  integrationStepSeconds:.0001,
});

export const FEMUR_TIBIA_PROPRIOCEPTION_FIELDS=Object.freeze([
  'jointAngle','jointVelocity','phaseSin','phaseCos','phaseVelocity',
  'amplitude','load','stance','contact','lift',
  'clawFlexion','clawExtension','hookFlexion','hookExtension','club',
]);

export const FEMUR_TIBIA_PROPRIOCEPTION_LENGTH=2+6*FEMUR_TIBIA_PROPRIOCEPTION_FIELDS.length;
