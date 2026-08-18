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
  for (const term of PRIVILEGED_KEYS) if (serialized.includes(`\"${term}\"`)) throw new Error(`Epistemic boundary violation: ${term}`);
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

/**
 * Neural output handed to the modeled VNC. It contains only low-dimensional
 * activity-derived drives. No sensory packet or world object can cross back in.
 */
export function sanitizeMotorPacket(packet = {}) {
  return {
    forward:clamp01(packet.forward),
    reverse:clamp01(packet.reverse),
    turn:clampSigned(packet.turn),
    feed:clamp01(packet.feed),
    drink:clamp01(packet.drink),
    escape:clamp01(packet.escape),
    halt:clamp01(packet.halt),
    confidence:clamp01(packet.confidence),
    // Functional population evidence used only by Natural mode's VNC bridge.
    odorBias:clampSigned(packet.odorBias),
    odorPresence:clamp01(packet.odorPresence),
    visualBias:clampSigned(packet.visualBias),
    visualRisk:clamp01(packet.visualRisk),
    memoryBias:clampSigned(packet.memoryBias),
    memoryConfidence:clamp01(packet.memoryConfidence),
    centralArousal:clamp01(packet.centralArousal),
    feedingEvidence:clamp01(packet.feedingEvidence),
  };
}
