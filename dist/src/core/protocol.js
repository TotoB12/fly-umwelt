import {FEMUR_TIBIA_MOTOR_UNIT_SPECS,LEG_IDS,LEG_MOTOR_ACTION_SPECS} from './constants.js';

export const WORLD_TO_BRAIN_FIELDS = Object.freeze([
  'retinaBrightness','retinaMotion','retinaLoom','retinaProximity',
  'odorLeft','odorRight',
  'touch','taste','airflow','temperature','proprioception','metabolic',
  // A private, body-relative memory cue. It contains no coordinate or object identity.
  'memoryCue','ambientNoise','dtMs',
]);

const PRIVILEGED_KEYS = Object.freeze([
  'x','y','position','heading','room','objects','objectid','foodposition','waterposition',
  'threatposition','target','targetvector','desiredheading','nearest','distance','bearing',
  'editor','selectedobject','path','waypoint','collisionnormal','worldpoint','coordinates',
]);

export function assertSensoryPacket(packet) {
  if (!packet || typeof packet !== 'object') throw new Error('Sensory packet must be an object.');
  const allowed = new Set(WORLD_TO_BRAIN_FIELDS);
  for (const key of Object.keys(packet)) if (!allowed.has(key)) throw new Error(`Epistemic boundary violation: ${key}`);
  const serialized = JSON.stringify(packet).toLowerCase();
  for (const term of PRIVILEGED_KEYS) if (serialized.includes(`"${term}"`)) throw new Error(`Epistemic boundary violation: ${term}`);
  return packet;
}

const floats = value => Float32Array.from(value || []);
export function createSensoryPacket(data) {
  return assertSensoryPacket({
    retinaBrightness:floats(data.retinaBrightness),
    retinaMotion:floats(data.retinaMotion),
    retinaLoom:floats(data.retinaLoom),
    retinaProximity:floats(data.retinaProximity),
    odorLeft:floats(data.odorLeft),
    odorRight:floats(data.odorRight),
    touch:floats(data.touch),
    taste:floats(data.taste),
    airflow:floats(data.airflow),
    temperature:Number(data.temperature),
    proprioception:floats(data.proprioception),
    metabolic:floats(data.metabolic),
    memoryCue:floats(data.memoryCue),
    ambientNoise:Number(data.ambientNoise ?? 0),
    dtMs:Number(data.dtMs),
  });
}

const clamp01 = v => Number.isFinite(Number(v)) ? Math.max(0, Math.min(1, Number(v))) : 0;
const clampSigned = v => Number.isFinite(Number(v)) ? Math.max(-1, Math.min(1, Number(v))) : 0;
const clampSpikeCount = v => Number.isFinite(Number(v)) ? Math.max(0, Math.min(65535, Math.round(Number(v)))) : 0;

/**
 * Activity-derived evidence handed to the browser body. Identified leg pools
 * are separate effectors. Descending populations can coordinate timing and
 * steering, but the plant is not allowed to translate without leg activation.
 */
export function sanitizeMotorPacket(packet = {}) {
  const sourceLegs=packet.legs||packet.legDrive||[];
  const legs=LEG_IDS.map((id,index)=>clamp01(sourceLegs[index] ?? packet[`leg${id}`]));
  const sourceActuators=packet.actuators||packet.legActuators||[];
  const actuators=Array.from({length:LEG_IDS.length*LEG_MOTOR_ACTION_SPECS.length},(_,index)=>clamp01(sourceActuators[index]));
  const sourceMotorUnits=packet.motorUnits||packet.femurTibiaMotorUnits||[];
  const motorUnits=Array.from({length:LEG_IDS.length*FEMUR_TIBIA_MOTOR_UNIT_SPECS.length},(_,index)=>clamp01(sourceMotorUnits[index]));
  const sourceMotorUnitSpikeCounts=packet.motorUnitSpikeCounts||packet.femurTibiaMotorUnitSpikeCounts||[];
  const motorUnitSpikeCounts=Array.from({length:LEG_IDS.length*FEMUR_TIBIA_MOTOR_UNIT_SPECS.length},(_,index)=>clampSpikeCount(sourceMotorUnitSpikeCounts[index]));
  return {
    locomotorDrive:clamp01(packet.locomotorDrive),
    coordinationDrive:clamp01(packet.coordinationDrive ?? packet.locomotorDrive),
    legs,
    // Flat [leg][action] array. Action order is LEG_MOTOR_ACTION_SPECS and is
    // stable across workers/save files. These are decoded motor-population
    // activities, not calibrated muscle forces.
    actuators,
    // Flat [leg][unit] supplement. The 72 action channels remain stable and
    // authoritative for compatibility; these channels retain experimentally
    // meaningful unit identities where BANC supplies them.
    motorUnits,
    // Exact counts observed in the identified source populations during one
    // neural frame. Timing within that frame is not reconstructed. These are
    // consumed once by frame id, never treated as a held activity command.
    motorUnitSpikeCounts,
    motorFrameId:Math.max(0,Math.floor(Number(packet.motorFrameId)||0)),
    motorFrameDurationMs:Math.max(0,Math.min(1000,Number(packet.motorFrameDurationMs)||0)),
    dna02Left:clamp01(packet.dna02Left),
    dna02Right:clamp01(packet.dna02Right),
    dna01Left:clamp01(packet.dna01Left),
    dna01Right:clamp01(packet.dna01Right),
    dng13Left:clamp01(packet.dng13Left),
    dng13Right:clamp01(packet.dng13Right),
    reverse:clamp01(packet.reverse),
    feed:clamp01(packet.feed),
    drink:clamp01(packet.drink),
    escape:clamp01(packet.escape),
    halt:clamp01(packet.halt),
    confidence:clamp01(packet.confidence),
    conflict:clamp01(packet.conflict),
    feedingEvidence:clamp01(packet.feedingEvidence),
    // Observer summaries only. The body derives motion from the populations above.
    legLeft:clamp01(packet.legLeft ?? (legs[0]+legs[1]+legs[2])/3),
    legRight:clamp01(packet.legRight ?? (legs[3]+legs[4]+legs[5])/3),
    turnEvidence:clampSigned(packet.turnEvidence),
    centralArousal:clamp01(packet.centralArousal),
  };
}
