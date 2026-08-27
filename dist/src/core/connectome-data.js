import {gunzipBuffer, gunzipText, parseCsv} from './csv.js';
import {hashString} from './prng.js';
import {
  ANY_OUTPUT_MASK, FEMUR_TIBIA_MOTOR_UNIT_SPECS, LEG_IDS, LEG_MOTOR_ACTION_BY_SOURCE, LEG_MOTOR_ACTION_SPECS,
  LEG_OUTPUT_FLAGS, LEG_SENSORY_MODALITIES, OUTPUT_FLAGS, OUTPUT_POPULATION_SPECS,
  RETINA_RAYS, legMotorActionPopulationKey, legMotorUnitPopulationKey,
} from './constants.js';

const NT_CODES = Object.freeze({
  ACH:1, ACETYLCHOLINE:1,
  GABA:2,
  GLUT:3, GLUTAMATE:3,
  HISTAMINE:7, HIS:7,
  // These channels are biologically active but do not have a justified single
  // instantaneous fast sign in the present receptor-free model.
  DA:0, DOPAMINE:0, OA:0, OCTOPAMINE:0, SER:0, SEROTONIN:0,
  TYRAMINE:0, TYR:0, MODULATORY:0, CONFLICT:0, UNKNOWN:0,
});

function transmitterSign(code) {
  if(code===1)return 1;
  if(code===2||code===3||code===7)return -1;
  return 0;
}

function signedSynapseWeight(raw, presynapticNtCode) {
  return Math.abs(raw) * transmitterSign(presynapticNtCode);
}

async function digestHex(algorithm, bytes) {
  if (!globalThis.crypto?.subtle) return null;
  const digest = new Uint8Array(await crypto.subtle.digest(algorithm, bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyCompressedAsset(buffer, integrity, url, onProgress) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error(`${url} is not a gzip data object`);
  const expectedGitBlobSha1 = integrity?.gitBlobSha1 || '';
  const expectedSha256 = integrity?.sha256 || '';
  if (!expectedGitBlobSha1 && !expectedSha256) return;
  if (!globalThis.crypto?.subtle) {
    onProgress({phase:'integrity', message:`WebCrypto unavailable; could not verify ${url.split('/').pop()}.`});
    return;
  }
  if (expectedGitBlobSha1) {
    const prefix = new TextEncoder().encode(`blob ${buffer.byteLength}\0`);
    const payload = new Uint8Array(prefix.length + buffer.byteLength);
    payload.set(prefix, 0);
    payload.set(bytes, prefix.length);
    const actual = await digestHex('SHA-1', payload);
    if (actual !== expectedGitBlobSha1.toLowerCase()) throw new Error(`Integrity mismatch for ${url.split('/').pop()}: expected Git blob ${expectedGitBlobSha1}, received ${actual}.`);
  }
  if (expectedSha256) {
    const actual = await digestHex('SHA-256', bytes);
    if (actual !== expectedSha256.toLowerCase()) throw new Error(`Integrity mismatch for ${url.split('/').pop()}: expected SHA-256 ${expectedSha256}, received ${actual}.`);
  }
  onProgress({phase:'integrity', message:`Verified ${url.split('/').pop()}.`});
}

async function fetchCompressed(url, onProgress = () => {}, integrity = {}) {
  const cache = typeof caches !== 'undefined' ? await caches.open('fly-cns-connectome-v5') : null;
  const hit = cache ? await cache.match(url) : null;
  if (hit) {
    try {
      const buffer = await hit.clone().arrayBuffer();
      await verifyCompressedAsset(buffer, integrity, url, onProgress);
      onProgress({phase:'cache', message:`Using cached bundled ${url.split('/').pop()}`});
      return new Response(buffer, {headers:{'Content-Type':'application/gzip'}});
    } catch (error) {
      await cache.delete(url);
      onProgress({phase:'fallback', message:`Discarded invalid cached ${url.split('/').pop()}: ${error.message}`});
    }
  }
  onProgress({phase:'download', message:`Loading bundled ${url.split('/').pop()}`});
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(30_000) : undefined;
  const resolved = new URL(url, self.location.href);
  if (resolved.origin !== self.location.origin) throw new Error(`Runtime graph assets must be same-origin: ${resolved.href}`);
  const res = await fetch(resolved.href, {mode:'same-origin', credentials:'same-origin', cache:'no-cache', signal});
  if (!res.ok) throw new Error(`Unable to load bundled ${resolved.pathname}: HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  await verifyCompressedAsset(buffer, integrity, url, onProgress);
  const response = new Response(buffer, {headers:{'Content-Type':'application/gzip'}});
  if (cache) await cache.put(url, response.clone());
  return response;
}

async function fetchAsset(spec, filename, mode, onProgress, assetBase = self.location.href) {
  if (!spec?.local) throw new Error(`No bundled same-origin source for ${filename}.`);
  const url = new URL(spec.local, assetBase);
  if (url.origin !== self.location.origin) throw new Error(`Bundled asset escaped the application origin: ${url.href}`);
  const integrity = {
    gitBlobSha1: spec?.gitBlobSha1 || (/^[0-9a-f]{40}$/i.test(spec?.sha || '') ? spec.sha : ''),
    sha256: spec?.sha256 || '',
  };
  const response = await fetchCompressed(url.href, onProgress, integrity);
  return mode === 'text' ? gunzipText(response) : gunzipBuffer(response);
}

function fieldIndex(header, ...names) {
  const lower = header.map(x => String(x).trim().toLowerCase());
  for (const name of names) {
    const i = lower.indexOf(String(name).toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

function cell(row, index) { return index >= 0 ? String(row[index] ?? '').trim() : ''; }
function normalizeSide(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'l' || v === 'left' || /(^|[ _-])left([ _-]|$)/.test(v)) return -1;
  if (v === 'r' || v === 'right' || /(^|[ _-])right([ _-]|$)/.test(v)) return 1;
  return 0;
}
function sideKey(side) { return side < 0 ? 'Left' : side > 0 ? 'Right' : 'Both'; }
function legIdFor(side,bodyText,annotationText='') {
  if(!side)return '';
  const text=`${bodyText||''} ${annotationText||''}`.toLowerCase();
  let segment='';
  if(/front[_ -]?leg|foreleg|prothoracic/.test(text))segment='F';
  else if(/middle[_ -]?leg|midleg|mesothoracic/.test(text))segment='M';
  else if(/hind[_ -]?leg|hindleg|metathoracic/.test(text))segment='H';
  return segment?`${side<0?'L':'R'}${segment}`:'';
}
function classifyLegSensorySubtype(text='') {
  const value=String(text).toLowerCase();
  const result=[];
  if(/tactile|bristle|taste_bristle|contact/.test(value))result.push('Tactile');
  if(/proprio|chordotonal|hair[_ -]?plate|campaniform/.test(value))result.push('Proprio');
  if(/joint[_ -]?angle|(^|[^a-z])position([^a-z]|$)|hair[_ -]?plate|claw[_ -]?chordotonal/.test(value))result.push('Position');
  if(/(^|[^a-z])direction([^a-z]|$)|hook[_ -]?chordotonal|movement/.test(value))result.push('Movement');
  if(/vibro|vibration|club[_ -]?chordotonal/.test(value))result.push('Vibration');
  if(/mechanical[_ -]?strain|campaniform|load/.test(value))result.push('Load');
  return result;
}
function legSensoryModalityMask(text='') {
  const value=String(text).toLowerCase();
  let mask=0;
  const bit=id=>LEG_SENSORY_MODALITIES.find(item=>item.id===id)?.bit||0;
  if(/tactile|bristle|contact|taste_bristle/.test(value))mask|=bit('tactile');
  if(/proprio|chordotonal|hair[_ -]?plate|campaniform|joint[_ -]?angle|mechanical[_ -]?strain/.test(value))mask|=bit('proprioception');
  if(/joint[_ -]?angle|(^|[^a-z])position([^a-z]|$)|hair[_ -]?plate|claw[_ -]?chordotonal|vibro_position/.test(value))mask|=bit('jointAngle');
  if(/(^|[^a-z])direction([^a-z]|$)|movement|hook[_ -]?chordotonal/.test(value))mask|=bit('movementDirection');
  if(/vibro|vibration|club[_ -]?chordotonal/.test(value))mask|=bit('vibration');
  if(/mechanical[_ -]?strain|campaniform|(^|[^a-z])load([^a-z]|$)/.test(value))mask|=bit('strain');
  if(/nocicep|noxious|pain/.test(value))mask|=bit('nociception');
  if(/gustat|taste|(^|[^a-z])gr\d|sugar|bitter|salt|pheromone/.test(value))mask|=bit('gustatory');
  return mask;
}
function femurTibiaMotorUnitId(type='',actionId=''){
  const value=String(type).toLowerCase();
  if(actionId==='femurTibiaExtend'){
    if(/tibia_extensor_seti/.test(value))return 'extensorSlow';
    if(/tibia_extensor_feti/.test(value))return 'extensorFast';
    return '';
  }
  if(actionId!=='femurTibiaFlex')return '';
  if(/accessory_tibia_flexor_a_slow/.test(value))return 'flexorSlow';
  if(/tibia_flexor_fast/.test(value))return 'flexorFast';
  return 'flexorUnresolved';
}
function append(map, key, value) { (map[key] ||= []).push(value); }
function uniqueTyped(values) { return Uint32Array.from(new Set(values || [])); }
function countPopulation(p, prefix) { return Object.entries(p).filter(([k]) => k.startsWith(prefix)).reduce((s,[,v]) => s + (v?.length || 0), 0); }
function unionPopulations(...lists) {
  const out=[];
  for(const list of lists) if(list?.length) for(const value of list) out.push(value);
  return uniqueTyped(out);
}
function sampleDeterministically(indices, rootIds, limit=384, salt='sample') {
  if(!indices?.length)return new Uint32Array();
  const values=Array.from(indices);
  if(values.length<=limit)return Uint32Array.from(values);
  values.sort((a,b)=>(hashString(`${salt}:${rootIds[a]||a}`)>>>0)-(hashString(`${salt}:${rootIds[b]||b}`)>>>0));
  return Uint32Array.from(values.slice(0,limit));
}

const FOOD_RECEPTORS = /or22a|or22b|or42a|or42b|or59b|or85a|or85b|or92a|food|fruit|ferment|yeast|vinegar|ethyl.?acetate|dm1|dm2|va2|vm7/i;
const WATER_RECEPTORS = /ir68a|ir40a|hygro|humidity|humid|moist|water.?sensor|sacculus/i;
const THREAT_RECEPTORS = /or56a|or49a|gr21a|gr63a|geosmin|carbon.?dioxide|co2|avers|danger|alarm|wasp/i;
const SWEET_RECEPTORS = /sweet|sugar|glucose|fructose|gr5a|gr64/i;
const BITTER_RECEPTORS = /bitter|avers|toxin|gr66a|gr33a/i;
const WATER_TASTE_RECEPTORS = /water|ppk28|moist/i;

function classifyRows(text, idToIndex, groupFallback, N) {
  const rows = parseCsv(text);
  const h = rows[0] || [];
  const columns = {
    root: fieldIndex(h, 'root_id','root_783','root_888','id'),
    flow: fieldIndex(h, 'flow'),
    super: fieldIndex(h, 'super_class','superclass'),
    cls: fieldIndex(h, 'class','cell_class'),
    sub: fieldIndex(h, 'sub_class','cell_sub_class'),
    type: fieldIndex(h, 'cell_type','type','resolved_type'),
    side: fieldIndex(h, 'side','soma_side'),
    body: fieldIndex(h, 'body_part','target','effector'),
    bodySensory: fieldIndex(h, 'body_part_sensory'),
    bodyEffector: fieldIndex(h, 'body_part_effector'),
    peripheralTarget: fieldIndex(h, 'peripheral_target_type'),
    nerve: fieldIndex(h, 'nerve'),
    label: fieldIndex(h, 'label','name'),
    function: fieldIndex(h, 'function','cell_function','connectivity_tag'),
    functionDetailed: fieldIndex(h, 'function_detailed','cell_function_detailed'),
    sensory: fieldIndex(h, 'sensory_in','sensory_input','sensory'),
    effector: fieldIndex(h, 'effector_out','motor_output','effector_output'),
    region: fieldIndex(h, 'region'),
    neuromere: fieldIndex(h, 'neuromere'),
    hemilineage: fieldIndex(h, 'hemilineage'),
    marker: fieldIndex(h, 'marker'),
    status: fieldIndex(h, 'status'),
    ntType: fieldIndex(h, 'nt_type'),
    ntSource: fieldIndex(h, 'nt_source'),
    ntConfidence: fieldIndex(h, 'nt_confidence'),
  };
  if (columns.root < 0) throw new Error('Classification table has no root_id column.');

  const pops = {};
  const flags = new Uint32Array(N);
  const annotations = new Array(N).fill('unannotated');
  const annotationDetail = new Array(N).fill('');
  const motorLegCode=new Uint8Array(N),motorActionCode=new Uint8Array(N),motorTargetCode=new Uint8Array(N),motorUnitClassCode=new Uint8Array(N);
  const sensoryLegCode=new Uint8Array(N),sensoryModalityMask=new Uint16Array(N),sensorySubtypeCode=new Uint8Array(N),peripheralUncertaintyCode=new Uint8Array(N);
  const motorTargets=[''];
  const motorTargetCodes=new Map();
  const motorCellTypes=new Set();
  const central = [];
  const receptorSpecific = {food:0, water:0, threat:0};
  let visualPrimary = 0, olfactoryPrimary = 0, explicitLegSensoryUnits=0, fallbackGroupsUsed = false, outputFunctionalGroupFallback = false;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const idx = idToIndex.get(cell(row, columns.root));
    if (idx === undefined) continue;
    const flow = cell(row, columns.flow).toLowerCase();
    const sup = cell(row, columns.super).toLowerCase();
    const cls = cell(row, columns.cls).toLowerCase();
    const sub = cell(row, columns.sub).toLowerCase();
    const type = cell(row, columns.type);
    const bodySensory = cell(row, columns.bodySensory).toLowerCase();
    const bodyEffector = cell(row, columns.bodyEffector).toLowerCase();
    const peripheralTarget = cell(row, columns.peripheralTarget).toLowerCase();
    const body = [cell(row, columns.body),bodySensory,bodyEffector,peripheralTarget].filter(Boolean).join(' ').toLowerCase();
    const nerve = cell(row, columns.nerve).toLowerCase();
    const label = cell(row, columns.label);
    const functionValue=cell(row,columns.function).toLowerCase();
    const functionDetailedValue=cell(row,columns.functionDetailed).toLowerCase();
    const fn = [functionValue,functionDetailedValue].filter(Boolean).join(' ').toLowerCase();
    const sensory = [cell(row, columns.sensory),bodySensory].filter(Boolean).join(' ').toLowerCase();
    const effector = [cell(row, columns.effector),bodyEffector].filter(Boolean).join(' ').toLowerCase();
    const region = cell(row,columns.region).toLowerCase();
    const neuromere = cell(row, columns.neuromere).toLowerCase();
    const hemilineage = cell(row, columns.hemilineage).toLowerCase();
    const marker = cell(row, columns.marker).toLowerCase();
    const status=cell(row,columns.status);
    const declaredSide=normalizeSide(cell(row, columns.side));
    const nerveSide=normalizeSide(nerve);
    const side=declaredSide||nerveSide;
    const sideSuffix = sideKey(side);
    const all = `${flow} ${region} ${sup} ${cls} ${sub} ${type} ${body} ${nerve} ${label} ${fn} ${sensory} ${effector} ${neuromere} ${hemilineage} ${marker}`.toLowerCase();
    const outputText = `${type} ${label} ${cls} ${sub} ${fn} ${effector} ${body} ${neuromere}`;
    const exactOutputText = `${type} ${label}`.trim();
    const legId = legIdFor(side,`${bodySensory} ${bodyEffector}`,`${cls} ${sub} ${type} ${fn} ${peripheralTarget}`);
    const legCode=legId?LEG_IDS.indexOf(legId)+1:0;
    annotations[idx] = type || label || sub || cls || sup || 'unannotated';
    annotationDetail[idx] = [flow,region,sup,cls,sub,type,cell(row,columns.side),body,nerve,label,fn,sensory,effector,neuromere,hemilineage,marker].filter(Boolean).join(' · ');

    const isAfferent = /afferent/.test(flow) || /sensory/.test(sup) || /sensory/.test(cls) || !!sensory || /primary.?sensory|photoreceptor|olfactory.?receptor|(^|\W)orn(\W|$)|(^|\W)grn(\W|$)/.test(all);
    const isEfferent = /efferent/.test(flow) || /motor/.test(sup) || /motor/.test(cls) || !!effector;
    if (/intrinsic/.test(flow) || (!isAfferent && !isEfferent)) central.push(idx);
    if(legCode&&isAfferent){
      if(/front[_ -]?leg|middle[_ -]?leg|hind[_ -]?leg/.test(bodySensory))explicitLegSensoryUnits++;
      const modalityText=`${cls} ${sub} ${type} ${functionValue} ${functionDetailedValue} ${peripheralTarget}`;
      const mask=legSensoryModalityMask(modalityText);
      sensoryLegCode[idx]=legCode;sensoryModalityMask[idx]=mask;
      if(mask&LEG_SENSORY_MODALITIES.find(item=>item.id==='jointAngle').bit)append(pops,`legJointAngle${legId}`,idx);
      if(mask&LEG_SENSORY_MODALITIES.find(item=>item.id==='movementDirection').bit)append(pops,`legMovementDirection${legId}`,idx);
      if(mask&LEG_SENSORY_MODALITIES.find(item=>item.id==='strain').bit)append(pops,`legStrain${legId}`,idx);
      if(mask&LEG_SENSORY_MODALITIES.find(item=>item.id==='nociception').bit)append(pops,`legNociception${legId}`,idx);
      if(mask&LEG_SENSORY_MODALITIES.find(item=>item.id==='gustatory').bit)append(pops,`legGustatory${legId}`,idx);
      // FeCO subclass identity is source-authored and more specific than the
      // broad modality mask. Signed claw/hook identity is retained only if the
      // annotation itself supplies it; current BANC labels do not justify
      // manufacturing a deterministic split of generic hook or claw roots.
      const subtypeText=`${sub} ${type} ${functionDetailedValue}`;
      if(/claw[_ -]?chordotonal/.test(subtypeText)){
        sensorySubtypeCode[idx]=1;append(pops,`legClaw${legId}`,idx);
        if(/flexion|flexed/.test(subtypeText))append(pops,`legClawFlexion${legId}`,idx);
        if(/extension|extended/.test(subtypeText))append(pops,`legClawExtension${legId}`,idx);
      }else if(/hook[_ -]?chordotonal/.test(subtypeText)){
        sensorySubtypeCode[idx]=2;append(pops,`legHook${legId}`,idx);
        if(/flexion/.test(subtypeText))append(pops,`legHookFlexion${legId}`,idx);
        if(/extension/.test(subtypeText))append(pops,`legHookExtension${legId}`,idx);
      }else if(/club[_ -]?chordotonal/.test(subtypeText)){
        sensorySubtypeCode[idx]=3;append(pops,`legClub${legId}`,idx);
      }
    }

    // Direct visual transduction is restricted to primary afferents/photoreceptors.
    const visual = /visual|optic|photoreceptor|photo.?receptor|retina|r1.?r6|r7|r8/.test(all);
    if (visual && (isAfferent || /photoreceptor|photo.?receptor|(^|\W)r[1-8](\W|$)/.test(all))) {
      append(pops, `visual${sideSuffix}`, idx); visualPrimary++;
    }

    // Direct chemical transduction is restricted to receptor/afferent labels.
    const olfactory = /olfact|odor|(^|\W)orn(\W|$)|antennal.?sensory|or\d|ir\d/.test(all);
    if (olfactory && isAfferent && !/projection.?neuron|(^|\W)pn(\W|$)|local.?neuron/.test(all)) {
      append(pops, `olfactory${sideSuffix}`, idx); olfactoryPrimary++;
      if (FOOD_RECEPTORS.test(all)) { append(pops, `olfactoryFoodAnnotated${sideSuffix}`, idx); receptorSpecific.food++; }
      else if (WATER_RECEPTORS.test(all)) { append(pops, `olfactoryWaterAnnotated${sideSuffix}`, idx); receptorSpecific.water++; }
      else if (THREAT_RECEPTORS.test(all)) { append(pops, `olfactoryThreatAnnotated${sideSuffix}`, idx); receptorSpecific.threat++; }
      else append(pops, `olfactoryUnknown${sideSuffix}`, idx);
    }

    const gustatory = /gustat|taste|(^|\W)grn(\W|$)|gr\d|labell|pharyn.*sensory/.test(all);
    if (gustatory && isAfferent) {
      if (WATER_TASTE_RECEPTORS.test(all)) append(pops, 'gustWater', idx);
      else if (BITTER_RECEPTORS.test(all)) append(pops, 'gustBitter', idx);
      else if (SWEET_RECEPTORS.test(all)) append(pops, 'gustSweet', idx);
      else append(pops, 'gustUnknown', idx);
    }

    const mechanosensory = /mechano|bristle|johnston|chordotonal|campaniform|proprio|hair.?plate|haltere|arista/.test(all);
    if (mechanosensory && isAfferent) {
      append(pops, `mech${sideSuffix}`, idx);
      if (/proprio|chordotonal|campaniform|hair.?plate/.test(all)) append(pops, `proprio${sideSuffix}`, idx);
      if (/johnston|arista|wind|airflow|haltere/.test(all)) append(pops, `airflow${sideSuffix}`, idx);
      if(legId){
        append(pops,`legSensory${legId}`,idx);
        const subtypeText=`${cls} ${sub} ${type} ${fn} ${peripheralTarget}`;
        for(const subtype of classifyLegSensorySubtype(subtypeText))append(pops,`leg${subtype}${legId}`,idx);
      }
    }

    const thermohygro = /thermo|temperature|hot|cold|cool|hygro|humidity|moist|dry/.test(all);
    if (thermohygro && isAfferent) {
      if (/cool|cold/.test(all)) append(pops, 'thermoCool', idx);
      else if (/hygro|humidity|moist|dry/.test(all)) append(pops, 'hygro', idx);
      else append(pops, 'thermoWarm', idx);
    }

    const endocrine = /endocrine|pars.?intercerebralis|pars.?lateralis|neurosecret|insulin|akh|diuretic|leucokinin|sleep|circadian/.test(all);
    if (endocrine) {
      append(pops, 'endocrine', idx);
      if (/insulin|akh|energy|glucose|sugar|hunger|adipokinetic/.test(all)) append(pops, 'endocrineEnergy', idx);
      if (/diuretic|leucokinin|water|thirst|osmo|hygro/.test(all)) append(pops, 'endocrineWater', idx);
      if (/sleep|circadian|clock|fatigue/.test(all)) append(pops, 'endocrineFatigue', idx);
    }

    const isDescending = /descending/.test(sup) || /descending/.test(cls) || /(^|[^a-z0-9])dn[a-z0-9]+([^a-z0-9]|$)/i.test(outputText);
    if (isDescending) {
      append(pops, 'descending', idx);
      append(pops, side < 0 ? 'descendingLeft' : side > 0 ? 'descendingRight' : 'descendingMidline', idx);
      flags[idx] |= OUTPUT_FLAGS.DESCENDING;
    }

    const isMotor = isEfferent || /motor.?neuron/.test(all);
    if (isMotor && /proboscis|ingestion|haustellum|pharynx|esophagus/.test(all)) { append(pops, 'proboscisMotor', idx); flags[idx] |= OUTPUT_FLAGS.PROBOSCIS_MOTOR; }
    // BANC provides an explicit leg_motor_neuron class. Do not inflate that
    // audited set with adjacent hind-leg or broadly motor-labelled classes.
    // The sub-class fallback exists only for packs that omit the class field.
    const isLegMotor=isMotor&&(cls==='leg_motor_neuron'||(!cls&&/^(?:front|middle|hind)_leg_motor_neuron$/.test(sub)));
    if (isLegMotor && legId) {
      append(pops, 'leg_motor', idx);
      append(pops, `leg_motor_${side < 0 ? 'L' : 'R'}`, idx);
      append(pops, `legMotor${legId}`, idx);
      flags[idx] |= OUTPUT_FLAGS.LEG_MOTOR | LEG_OUTPUT_FLAGS[legId];
      motorLegCode[idx]=legCode;
      if(type)motorCellTypes.add(type);
      const action=LEG_MOTOR_ACTION_BY_SOURCE[functionDetailedValue];
      if(action){
        motorActionCode[idx]=action.code;
        append(pops,legMotorActionPopulationKey(legId,action.id),idx);
        const unitId=femurTibiaMotorUnitId(type,action.id);
        if(unitId){
          const unitIndex=FEMUR_TIBIA_MOTOR_UNIT_SPECS.findIndex(spec=>spec.id===unitId);
          motorUnitClassCode[idx]=unitIndex+1;
          append(pops,legMotorUnitPopulationKey(legId,unitId),idx);
        }
      }
      if(peripheralTarget){
        let targetCode=motorTargetCodes.get(peripheralTarget);
        if(!targetCode){targetCode=motorTargets.length;motorTargetCodes.set(peripheralTarget,targetCode);motorTargets.push(peripheralTarget);}
        motorTargetCode[idx]=targetCode;
      }
      let uncertainty=0;
      if(/LR_TYPE_CONFLICT/.test(status))uncertainty|=1;
      if(/SIDE_CONFLICT/.test(status)||(declaredSide&&nerveSide&&declaredSide!==nerveSide))uncertainty|=2;
      if(/TRACING_ISSUE/.test(status))uncertainty|=4;
      if(!cell(row,columns.ntType)||/missing/i.test(cell(row,columns.ntSource)))uncertainty|=8;
      peripheralUncertaintyCode[idx]=uncertainty;
    }

    for (const spec of OUTPUT_POPULATION_SPECS) {
      if (!spec.pattern.test(spec.exact?exactOutputText:outputText)) continue;
      append(pops, spec.name, idx);
      if (side) append(pops, `${spec.name}_${side < 0 ? 'L' : 'R'}`, idx);
      flags[idx] |= (1 << spec.bit);
    }
    // Anatomical side is orthogonal to output class. Preserve it for every
    // output neuron, including VNC motor neurons in BANC packs.
    if ((flags[idx] & ANY_OUTPUT_MASK) && side < 0) flags[idx] |= OUTPUT_FLAGS.LEFT;
    if ((flags[idx] & ANY_OUTPUT_MASK) && side > 0) flags[idx] |= OUTPUT_FLAGS.RIGHT;
  }

  // The reference browser pack has source-authored functional group IDs. They
  // are used only when primary annotation fields are absent, and the UI reports it.
  if (visualPrimary < 8 || olfactoryPrimary < 4) {
    fallbackGroupsUsed = true;
    for (let i = 0; i < groupFallback.length; i++) {
      const g = groupFallback[i];
      if (visualPrimary < 8 && g >= 0 && g <= 5) append(pops, 'visualBoth', i);
      if (olfactoryPrimary < 4 && (g === 6 || g === 7)) append(pops, 'olfactoryBoth', i);
      if ([10,11,12,13].includes(g)) append(pops, 'mechBoth', i);
      if (g === 32) append(pops, 'gustSweet', i);
      if (g === 33) append(pops, 'gustBitter', i);
      if (g === 34) append(pops, 'gustWater', i);
      if (g === 37 || g === 39) append(pops, 'endocrine', i);
      if (g === 35 || (g >= 42 && g <= 46)) { append(pops, 'descending', i); flags[i] |= OUTPUT_FLAGS.DESCENDING; }
      if (g === 56) { append(pops, 'proboscisMotor', i); flags[i] |= OUTPUT_FLAGS.PROBOSCIS_MOTOR; }
    }
  }

  // Output availability is checked independently from sensory annotations.
  // The pinned reference binary carries source-authored functional group IDs;
  // use its broad GNG/descending group only when the public classification
  // table yields too few descending outputs to drive an embodied body. This is
  // never used by the strict named-neuron Evoked decoder and is disclosed.
  if ((pops.descending?.length || 0) < 8) {
    outputFunctionalGroupFallback = true;
    for (let i = 0; i < groupFallback.length; i++) {
      const g = groupFallback[i];
      if (g === 35 || (g >= 42 && g <= 46)) {
        append(pops, 'descending', i);
        append(pops, 'descendingMidline', i);
        flags[i] |= OUTPUT_FLAGS.DESCENDING;
      }
    }
  }
  if ((pops.proboscisMotor?.length || 0) === 0) {
    for (let i = 0; i < groupFallback.length; i++) {
      if (groupFallback[i] === 56) {
        outputFunctionalGroupFallback = true;
        append(pops, 'proboscisMotor', i);
        flags[i] |= OUTPUT_FLAGS.PROBOSCIS_MOTOR;
      }
    }
  }

  if (!central.length) for (let i = 0; i < groupFallback.length; i++) if (groupFallback[i] >= 17 && groupFallback[i] <= 41) central.push(i);
  for (const key of Object.keys(pops)) pops[key] = uniqueTyped(pops[key]);
  pops.central = uniqueTyped(central);

  const provenance = {
    classificationRows: Math.max(0, rows.length - 1),
    visualTransducers: countPopulation(pops, 'visual'),
    visualMapping: 'Primary visual afferents are available as anatomical hemifields. Optional angular sectors are deterministic proxies because exact ommatidial retinotopy is unavailable.',
    olfactoryTransducers: countPopulation(pops, 'olfactory'),
    olfactoryMapping: receptorSpecific.food + receptorSpecific.water + receptorSpecific.threat > 0
      ? 'Annotated receptor/type hints are preserved separately from optional deterministic proxy partitions.'
      : 'No receptor-specific labels found; chemical identity is unavailable unless the explicit proxy mapping is enabled.',
    receptorSpecific,
    sourceFunctionalGroupFallback: fallbackGroupsUsed,
    outputFunctionalGroupFallback,
    interoceptionMapping: 'Annotated endocrine/neurosecretory populations are preserved separately from optional deterministic proxy partitions.',
    outputMapping: outputFunctionalGroupFallback
      ? 'Narrow exact cell-type patterns plus a disclosed broad source-authored GNG/descending fallback because the annotation table did not expose enough descending outputs.'
      : 'Narrow exact cell-type patterns plus separately reported broad descending and VNC motor populations.',
  };
  const motorActionCounts={};
  for(const legId of LEG_IDS)for(const action of LEG_MOTOR_ACTION_SPECS){
    const count=pops[legMotorActionPopulationKey(legId,action.id)]?.length||0;
    if(count)motorActionCounts[`${legId}:${action.id}`]=count;
  }
  const motorUnitCounts={};
  for(const legId of LEG_IDS)for(const unit of FEMUR_TIBIA_MOTOR_UNIT_SPECS){
    const count=pops[legMotorUnitPopulationKey(legId,unit.id)]?.length||0;
    if(count)motorUnitCounts[`${legId}:${unit.id}`]=count;
  }
  const sensoryModalityCounts={};
  for(const modality of LEG_SENSORY_MODALITIES){let count=0;for(const mask of sensoryModalityMask)if(mask&modality.bit)count++;sensoryModalityCounts[modality.id]=count;}
  let motorUnits=0,sensoryUnits=0,uncertainMotorUnits=0;
  const uncertaintyCounts={lrTypeConflict:0,sideConflict:0,tracingIssue:0,missingTransmitterEvidence:0};
  for(let i=0;i<N;i++){
    if(sensoryLegCode[i])sensoryUnits++;
    if(!motorLegCode[i])continue;
    motorUnits++;const code=peripheralUncertaintyCode[i];if(code)uncertainMotorUnits++;
    if(code&1)uncertaintyCounts.lrTypeConflict++;if(code&2)uncertaintyCounts.sideConflict++;
    if(code&4)uncertaintyCounts.tracingIssue++;if(code&8)uncertaintyCounts.missingTransmitterEvidence++;
  }
  provenance.peripheralMapping={
    schema:'fly-umwelt-peripheral-atlas-v2',
    explanation:'BANC leg motor neurons retain leg, muscle target, joint action and femur–tibia motor-unit identity where source labels permit it. Leg afferents retain modality and FeCO claw/hook/club identity. These are anatomical/annotation mappings, not calibrated transfer functions.',
    motorUnits,motorCellTypes:motorCellTypes.size,mappedMotorActions:Object.values(motorActionCounts).reduce((sum,value)=>sum+value,0),motorTargets:motorTargets.length-1,
    sensoryUnits,explicitLegSensoryUnits,uncertainMotorUnits,uncertaintyCounts,motorActionCounts,motorUnitCounts,sensoryModalityCounts,
  };
  return {
    populations:pops,outputFlags:flags,annotations,annotationDetail,provenance,
    peripheralAtlas:{
      schema:'fly-umwelt-peripheral-atlas-v2',motorLegCode,motorActionCode,motorTargetCode,motorUnitClassCode,motorTargets,
      sensoryLegCode,sensoryModalityMask,sensorySubtypeCode,peripheralUncertaintyCode,
      motorActions:LEG_MOTOR_ACTION_SPECS.map((spec,index)=>({...spec,code:index+1})),
      motorUnitClasses:FEMUR_TIBIA_MOTOR_UNIT_SPECS.map((spec,index)=>({...spec,code:index+1})),
      sensoryModalities:LEG_SENSORY_MODALITIES.map(spec=>({...spec})),
    },
  };
}

function splitDeterministically(indices, rootIds, count) {
  const out = Array.from({length:count}, () => []);
  for (const idx of indices || []) out[hashString(rootIds[idx] || String(idx)) % count].push(idx);
  return out.map(uniqueTyped);
}

function buildRetinaSectors(pops, rootIds, count = RETINA_RAYS) {
  const sectors = Array.from({length:count}, () => []), used = new Set();
  const distribute = (indices, start, end) => {
    const span = Math.max(1, end - start);
    for (const idx of indices || []) {
      if (used.has(idx)) continue;
      used.add(idx);
      sectors[start + (hashString(rootIds[idx] || String(idx)) % span)].push(idx);
    }
  };
  const half = Math.ceil(count / 2);
  distribute(pops.visualLeft, 0, half);
  distribute(pops.visualRight, half, count);
  distribute(pops.visualBoth, 0, count);
  return sectors.map(uniqueTyped);
}

function ensureChemicalPartitions(mapping, rootIds) {
  const p = mapping.populations;
  const fallbackUsed = [];
  for (const side of ['Left','Right','Both']) {
    const base = p[`olfactory${side}`] || new Uint32Array();
    const unknown = p[`olfactoryUnknown${side}`]?.length ? p[`olfactoryUnknown${side}`] : base;
    const parts = splitDeterministically(unknown, rootIds, 3);
    for (const [channel, fallback] of [['Food',parts[0]],['Water',parts[1]],['Threat',parts[2]]]) {
      const annotatedKey = `olfactory${channel}Annotated${side}`;
      const proxyKey = `olfactory${channel}Proxy${side}`;
      const annotated = p[annotatedKey] || new Uint32Array();
      p[proxyKey] = uniqueTyped([...annotated, ...fallback]);
      if (fallback.length) fallbackUsed.push(proxyKey);
    }
  }
  const endocrine = p.endocrine || new Uint32Array();
  const eparts = splitDeterministically(endocrine, rootIds, 3);
  for (const [key, part] of [['endocrineEnergy',eparts[0]],['endocrineWater',eparts[1]],['endocrineFatigue',eparts[2]]]) {
    const annotated = p[key] || new Uint32Array();
    p[`${key}Proxy`] = uniqueTyped([...annotated, ...part]);
    if (part.length) fallbackUsed.push(`${key}Proxy`);
  }
  mapping.syntheticPopulationKeys = fallbackUsed.slice();
  mapping.provenance.syntheticPartitions = fallbackUsed.slice();
  mapping.provenance.availableMappingModes = {
    retinal:['hemifield','sector-proxy'],
    chemical:['annotated','proxy'],
    interoception:['annotated','proxy'],
  };
}


function buildSignalPopulations(mapping, rootIds) {
  const p=mapping.populations;
  const details=mapping.annotationDetail||[];
  const cx=[],cxLeft=[],cxRight=[],feeding=[],reward=[],threat=[];
  for(let i=0;i<details.length;i++){
    const text=String(details[i]||'').toLowerCase();
    if(/central.?complex|(^|\W)cx(\W|$)|epg|pfn|pfl|hdelta|fan.?shaped|ellipsoid|protocerebral.?bridge/.test(text)){
      cx.push(i);
      if(/(^|[ _·-])(left|l)([ _·-]|$)/.test(text))cxLeft.push(i);
      if(/(^|[ _·-])(right|r)([ _·-]|$)/.test(text))cxRight.push(i);
    }
    if(/feeding|proboscis|ingestion|haustellum|pharynx|(^|\W)mn9(\W|$)|sub.?esophageal|suboesophageal|(^|\W)sez(\W|$)/.test(text))feeding.push(i);
    if(/dopamin|(^|\W)dan(\W|$)|reward|mbon|mushroom.?body/.test(text))reward.push(i);
    if(/loom|giant.?fiber|avers|threat|escape|(^|\W)lc4(\W|$)|(^|\W)dnp09(\W|$)/.test(text))threat.push(i);
  }

  let memoryPool=uniqueTyped(cx);
  let memoryProxy=false;
  if(memoryPool.length<12){
    memoryPool=sampleDeterministically(p.central,rootIds,768,'memory-central-proxy');
    memoryProxy=true;
  }
  let memoryLeft=uniqueTyped(cxLeft),memoryRight=uniqueTyped(cxRight),memoryForward=new Uint32Array();
  if(memoryLeft.length<4||memoryRight.length<4){
    const parts=splitDeterministically(memoryPool,rootIds,3);
    memoryLeft=parts[0];memoryForward=parts[1];memoryRight=parts[2];
    memoryProxy=true;
  }else{
    const used=new Set([...memoryLeft,...memoryRight]);
    memoryForward=uniqueTyped(Array.from(memoryPool).filter(i=>!used.has(i)));
    if(!memoryForward.length)memoryForward=splitDeterministically(memoryPool,rootIds,3)[1];
  }

  const sig={
    odorFoodLeft:sampleDeterministically(unionPopulations(p.olfactoryFoodProxyLeft,p.olfactoryFoodAnnotatedLeft,p.olfactoryLeft),rootIds,256,'odor-food-L'),
    odorFoodRight:sampleDeterministically(unionPopulations(p.olfactoryFoodProxyRight,p.olfactoryFoodAnnotatedRight,p.olfactoryRight),rootIds,256,'odor-food-R'),
    odorWaterLeft:sampleDeterministically(unionPopulations(p.olfactoryWaterProxyLeft,p.olfactoryWaterAnnotatedLeft),rootIds,192,'odor-water-L'),
    odorWaterRight:sampleDeterministically(unionPopulations(p.olfactoryWaterProxyRight,p.olfactoryWaterAnnotatedRight),rootIds,192,'odor-water-R'),
    odorThreatLeft:sampleDeterministically(unionPopulations(p.olfactoryThreatProxyLeft,p.olfactoryThreatAnnotatedLeft),rootIds,192,'odor-threat-L'),
    odorThreatRight:sampleDeterministically(unionPopulations(p.olfactoryThreatProxyRight,p.olfactoryThreatAnnotatedRight),rootIds,192,'odor-threat-R'),
    visualLeft:sampleDeterministically(unionPopulations(p.visualLeft,p.visualBoth),rootIds,320,'visual-L'),
    visualRight:sampleDeterministically(unionPopulations(p.visualRight,p.visualBoth),rootIds,320,'visual-R'),
    centralArousal:sampleDeterministically(p.central,rootIds,512,'central-arousal'),
    feeding:sampleDeterministically(unionPopulations(p.proboscisMotor,p.gustSweet,p.gustWater,feeding),rootIds,256,'feeding'),
    reward:sampleDeterministically(unionPopulations(reward,p.endocrineEnergy,p.endocrineEnergyProxy),rootIds,256,'reward'),
    threat:sampleDeterministically(unionPopulations(threat,p.gustBitter,p.olfactoryThreatProxyBoth),rootIds,256,'threat'),
    memoryLeft:sampleDeterministically(memoryLeft,rootIds,256,'memory-L'),
    memoryForward:sampleDeterministically(memoryForward,rootIds,256,'memory-F'),
    memoryRight:sampleDeterministically(memoryRight,rootIds,256,'memory-R'),
  };
  mapping.signalPopulations=sig;
  mapping.provenance.functionalSignals={
    explanation:'Natural mode reads normalized neural state from bounded sensory, central-complex, feeding and descending populations. It never reads world coordinates or object identities.',
    memoryMapping:memoryProxy?'A deterministic subset of central neurons is used as a disclosed path-integration input proxy because exact memory-state physiology is not contained in the connectome.':'Central-complex annotations provide the memory-bias input populations.',
    counts:Object.fromEntries(Object.entries(sig).map(([key,value])=>[key,value.length])),
  };
}

function ensureOutputSidePartitions(mapping, rootIds) {
  const p = mapping.populations;
  const flags = mapping.outputFlags;
  const left = new Set(p.descendingLeft || []);
  const right = new Set(p.descendingRight || []);
  const unresolved = Array.from(p.descending || []).filter(index => !left.has(index) && !right.has(index));
  const [proxyLeft, proxyRight] = splitDeterministically(unresolved, rootIds, 2);
  p.descendingProxyLeft = proxyLeft;
  p.descendingProxyRight = proxyRight;
  for (const index of proxyLeft) flags[index] |= OUTPUT_FLAGS.PROXY_LEFT;
  for (const index of proxyRight) flags[index] |= OUTPUT_FLAGS.PROXY_RIGHT;
  mapping.provenance.outputSideProxy = unresolved.length
    ? `${unresolved.length} descending neurons lacked usable left/right annotation. They are available to Natural and Causal modes through a deterministic root-ID side partition; Evoked mode never uses it.`
    : 'All loaded descending outputs had usable anatomical side metadata; no side proxy was needed.';
  mapping.provenance.outputMapping = `${mapping.provenance.outputMapping} Population mode can use normalized broad descending activity; side-proxy contribution is separately disclosed and switchable.`;
}

function parseNeuronTable(neuronText) {
  const rows = parseCsv(neuronText), header = rows[0] || [];
  const rootI = fieldIndex(header,'root_id','root_783','root_888','id');
  const ntI = fieldIndex(header,'nt_type','neurotransmitter_predicted','predicted_nt','top_nt','nt');
  if (rootI < 0) throw new Error('Neuron table has no root_id column.');
  const rootIds = new Array(Math.max(0, rows.length - 1)), ntCode = new Uint8Array(rootIds.length), idToIndex = new Map();
  for (let r = 1; r < rows.length; r++) {
    const id = cell(rows[r], rootI);
    if (!id) throw new Error(`Neuron row ${r + 1} has no root ID.`);
    if (idToIndex.has(id)) throw new Error(`Duplicate root ID ${id}.`);
    rootIds[r-1] = id; idToIndex.set(id, r-1);
    ntCode[r-1] = NT_CODES[cell(rows[r], ntI).toUpperCase()] || 0;
  }
  return {rootIds, ntCode, idToIndex};
}

function finalizePack({rootIds,ntCode,idToIndex,rowPtr,post,weight,region,group,classText,manifest,E}) {
  const mapping = classifyRows(classText,idToIndex,group,rootIds.length);
  mapping.provenance.transmitterSignModel = {
    excitatoryFastApproximation:['acetylcholine'],
    inhibitoryFastApproximation:['GABA','glutamate','histamine'],
    zeroInstantaneousFastGain:['dopamine','octopamine','serotonin','tyramine','nitric oxide','neuropeptide','conflict','unknown'],
    explanation:'A presynaptic fast channel is used only when the metadata supports one fast transmitter. Modulatory, conflicting and unknown calls remain structurally present but contribute zero instantaneous current until receptor-aware dynamics exist.',
  };
  ensureChemicalPartitions(mapping,rootIds);
  ensureOutputSidePartitions(mapping,rootIds);
  mapping.retinaSectors = buildRetinaSectors(mapping.populations,rootIds,RETINA_RAYS);
  buildSignalPopulations(mapping,rootIds);
  const counts = Object.fromEntries(Object.entries(mapping.populations).map(([k,v]) => [k,v.length]));
  return {
    N:rootIds.length,E,rowPtr,post,weight,region,group,ntCode,rootIds,
    annotations:mapping.annotations,annotationDetail:mapping.annotationDetail,
    mapping,counts,manifest,
  };
}

const DISPLAY_GROUPS = Object.freeze([
  {id:0,key:'other',label:'Other / unmapped'},
  {id:1,key:'visual',label:'Visual afferents'},
  {id:2,key:'olfactory',label:'Olfactory afferents'},
  {id:3,key:'body',label:'Body senses'},
  {id:4,key:'interoceptive',label:'Interoceptive / endocrine'},
  {id:5,key:'memory',label:'Memory-guidance mapping'},
  {id:6,key:'central',label:'Central network'},
  {id:7,key:'descending',label:'Descending output'},
  {id:8,key:'feeding',label:'Motor / feeding output'},
]);

/**
 * Compact observer-side grouping for sampled firing-neuron indices. It is
 * derived from the parser's existing real population mappings, does not alter
 * the engine, and does not cross the world-to-brain protocol.
 */
export function buildDisplayAtlas(data) {
  const N = Math.max(0, Number(data?.N) || 0);
  const populations = data?.mapping?.populations || {};
  const signals = data?.mapping?.signalPopulations || {};
  const groupByNeuron = new Uint8Array(N);
  const assign = (indices, group) => {
    for (const raw of indices || []) {
      const index = Number(raw);
      if (index >= 0 && index < N) groupByNeuron[index] = group;
    }
  };
  const assignKeys = (keys, group) => { for (const key of keys) assign(populations[key], group); };

  assign(populations.central, 6);
  assign(signals.memoryLeft, 5); assign(signals.memoryForward, 5); assign(signals.memoryRight, 5);
  assignKeys(Object.keys(populations).filter((key) => /^(mech|gust|airflow|proprio|thermo|hygro|leg(?:Sensory|Tactile|Proprio|Position|Movement|Vibration|Load|JointAngle|MovementDirection|Strain|Nociception|Gustatory|Claw|Hook|Club))/.test(key)), 3);
  assignKeys(Object.keys(populations).filter((key) => key.startsWith('endocrine')), 4);
  assignKeys(Object.keys(populations).filter((key) => key.startsWith('olfactory')), 2);
  assignKeys(['visualLeft', 'visualRight', 'visualBoth'], 1);
  assignKeys(Object.keys(populations).filter((key) => key.startsWith('descending') || /^DN/.test(key) || key.startsWith('MDN_')), 7);
  assignKeys(['proboscisMotor',...LEG_IDS.map(id=>`legMotor${id}`)], 8); assign(signals.feeding, 8);

  const counts = new Uint32Array(DISPLAY_GROUPS.length);
  for (const group of groupByNeuron) counts[group]++;
  return {
    groupByNeuron,
    groups: DISPLAY_GROUPS.map((group) => ({...group, count: counts[group.id]})),
    provenance: {
      source: 'connectome population mappings',
      memory: data?.mapping?.provenance?.functionalSignals?.memoryMapping || '',
      note: 'Diagrammatic display grouping for sampled model spikes; not anatomy or a full recording.',
    },
  };
}

export function parseConnectomePack(neuronText, classText, graphBuffer, manifest = {}) {
  const {rootIds,ntCode,idToIndex} = parseNeuronTable(neuronText), N = rootIds.length;
  if (graphBuffer.byteLength < 8) throw new Error('Connectome graph is truncated.');
  const view = new DataView(graphBuffer), graphN = view.getUint32(0,true), E = view.getUint32(4,true);
  if (graphN !== N) throw new Error(`Graph has ${graphN} neurons but metadata has ${N}.`);
  const expected = 8 + E * 12 + N * 3;
  if (graphBuffer.byteLength < expected) throw new Error(`Connectome graph is truncated (${graphBuffer.byteLength} < ${expected}).`);
  if (manifest.neuronCount && Number(manifest.neuronCount) !== N) throw new Error(`Manifest expected ${manifest.neuronCount} neurons but loaded ${N}.`);
  if (manifest.edgeCount && Number(manifest.edgeCount) !== E) throw new Error(`Manifest expected ${manifest.edgeCount} edges but loaded ${E}.`);

  const rowPtr = new Uint32Array(N+1), post = new Uint32Array(E), weight = new Float32Array(E);
  let offset = 8, nextRow = 0, previousPre = -1;
  for (let e=0;e<E;e++,offset+=12) {
    const pre=view.getUint32(offset,true), target=view.getUint32(offset+4,true), raw=Math.abs(view.getFloat32(offset+8,true));
    if(pre>=N||target>=N)throw new Error(`Edge ${e} references neuron outside 0..${N-1}.`);
    if(pre<previousPre)throw new Error('Single-file graph must be sorted by presynaptic index.');
    if(!Number.isFinite(raw))throw new Error(`Edge ${e} has non-finite weight.`);
    while(nextRow<=pre)rowPtr[nextRow++]=e;
    previousPre=pre;post[e]=target;weight[e]=signedSynapseWeight(raw,ntCode[pre]);
  }
  while(nextRow<=N)rowPtr[nextRow++]=E;
  const region=new Uint8Array(N),group=new Uint16Array(N);
  for(let i=0;i<N;i++,offset+=3){region[i]=view.getUint8(offset);group[i]=view.getUint16(offset+1,true);}
  return finalizePack({rootIds,ntCode,idToIndex,rowPtr,post,weight,region,group,classText,manifest,E});
}

export function parseShardedConnectomePack(neuronText,classText,shardBuffers,manifest={}) {
  let E=0;for(const buffer of shardBuffers){if(buffer.byteLength%12!==0)throw new Error('Invalid FCNS edge shard length.');E+=buffer.byteLength/12;}
  if(manifest.edgeCount&&Number(manifest.edgeCount)!==E)throw new Error(`Pack expected ${manifest.edgeCount} edges but contains ${E}.`);
  const accumulator=createShardedAccumulator(neuronText,classText,{...manifest,edgeCount:E});
  for(const buffer of shardBuffers)accumulator.append(buffer);
  return accumulator.finish();
}

function createShardedAccumulator(neuronText,classText,manifest={}){
  const {rootIds,ntCode,idToIndex}=parseNeuronTable(neuronText),N=rootIds.length,E=Number(manifest.edgeCount)||0;
  if(manifest.neuronCount&&Number(manifest.neuronCount)!==N)throw new Error(`Manifest expected ${manifest.neuronCount} neurons but loaded ${N}.`);
  if(!Number.isSafeInteger(E)||E<0)throw new Error('A finite edge count is required for streamed graph loading.');
  // One COO source index is the only graph-sized loader overhead. Each raw
  // shard can be released immediately instead of retaining every decompressed
  // shard alongside the final CSR arrays.
  const pre=new Uint32Array(E),post=new Uint32Array(E),weight=new Float32Array(E),rowPtr=new Uint32Array(N+1);
  let written=0,finished=false;
  return {
    append(buffer){
      if(finished)throw new Error('Cannot append to a finalized graph.');
      if(buffer.byteLength%12!==0)throw new Error('Invalid FCNS edge shard length.');
      const records=buffer.byteLength/12;
      if(written+records>E)throw new Error(`Graph contains more than the declared ${E} edges.`);
      const view=new DataView(buffer);
      for(let offset=0;offset<buffer.byteLength;offset+=12){
        const source=view.getUint32(offset,true),target=view.getUint32(offset+4,true),raw=Math.abs(view.getFloat32(offset+8,true));
        if(source>=N||target>=N)throw new Error(`Edge references neuron outside 0..${N-1}.`);
        if(!Number.isFinite(raw))throw new Error('Non-finite edge weight.');
        pre[written]=source;post[written]=target;weight[written]=signedSynapseWeight(raw,ntCode[source]);rowPtr[source+1]++;written++;
      }
    },
    finish(){
      if(finished)throw new Error('Graph was already finalized.');finished=true;
      if(written!==E)throw new Error(`Pack expected ${E} edges but contains ${written}.`);
      for(let i=1;i<=N;i++)rowPtr[i]+=rowPtr[i-1];
      // Deterministic in-place counting sort by presynaptic index. This reuses
      // the final post/weight arrays and avoids a second graph-sized copy.
      const cursor=rowPtr.slice(0,N);
      for(let source=0;source<N;source++){
        let index=cursor[source],end=rowPtr[source+1];
        while(index<end){
          const actual=pre[index];
          if(actual===source){cursor[source]=++index;continue;}
          const destination=cursor[actual]++;
          const displacedPre=pre[destination],displacedPost=post[destination],displacedWeight=weight[destination];
          pre[destination]=pre[index];post[destination]=post[index];weight[destination]=weight[index];
          pre[index]=displacedPre;post[index]=displacedPost;weight[index]=displacedWeight;
        }
      }
      const region=new Uint8Array(N).fill(1),group=new Uint16Array(N).fill(60);
      return finalizePack({rootIds,ntCode,idToIndex,rowPtr,post,weight,region,group,classText,manifest,E});
    },
  };
}

export function normalizeGraphTier(value='auto',manifest={}) {
  const tiers=manifest?.graph?.tiers||{};
  const requested=String(value||'auto').toLowerCase();
  if(requested==='auto')return 'auto';
  return tiers[requested]?requested:'auto';
}

export function resolveGraphTier(manifest={},requested='auto') {
  const graph=manifest.graph||{};
  if(!graph.tiers||!graph.components){
    return {id:'legacy',label:'Loaded graph',edgeCount:Number(manifest.edgeCount)||0,shards:graph.shards||[],components:[]};
  }
  const normalized=normalizeGraphTier(requested,manifest);
  const id=normalized==='auto'?(manifest.defaultGraphTier&&graph.tiers[manifest.defaultGraphTier]?manifest.defaultGraphTier:'balanced'):normalized;
  const tier=graph.tiers[id]||Object.values(graph.tiers)[0];
  const componentIds=tier.components||[];
  const shards=[];
  for(const componentId of componentIds){
    const component=graph.components[componentId];
    if(!component)throw new Error(`Graph tier ${id} references missing component ${componentId}.`);
    shards.push(...(component.shards||[]));
  }
  return {id,label:tier.label||id,description:tier.description||'',edgeCount:Number(tier.edgeCount)||0,shards,components:componentIds,automatic:normalized==='auto'};
}

export async function loadConnectome(manifest, onProgress = () => {}, options = {}) {
  const tier=resolveGraphTier(manifest,options.graphTier||'auto');
  onProgress({phase:'metadata', message:'Loading bundled neuron identities, annotations and transmitter evidence…',tier});
  const [neuronText,classText] = await Promise.all([
    fetchAsset(manifest.neurons,'neurons.csv.gz','text',onProgress,manifest.assetBase),
    fetchAsset(manifest.classification,'classification.csv.gz','text',onProgress,manifest.assetBase),
  ]);
  let result;
  const effectiveManifest={...manifest,edgeCount:tier.edgeCount||manifest.edgeCount,graphTier:tier.id,graphTierLabel:tier.label};
  const shards=tier.shards.length?tier.shards:manifest.graph?.shards;
  if(Array.isArray(shards)){
    onProgress({phase:'graph',message:`Loading bundled ${tier.label.toLowerCase()} graph · ${shards.length} static edge shards…`,tier});
    const accumulator=createShardedAccumulator(neuronText,classText,effectiveManifest);
    for(let i=0;i<shards.length;i++){
      const buffer=await fetchAsset(shards[i],`edge-shard-${String(i).padStart(3,'0')}.bin.gz`,'buffer',onProgress,manifest.assetBase);
      accumulator.append(buffer);
      onProgress({phase:'graph',message:`Parsed edge shard ${i+1}/${shards.length}; released its decompressed buffer.`,tier});
    }
    result=accumulator.finish();
  }else{
    onProgress({phase:'graph',message:'Loading bundled weighted connectome graph…',tier});
    const graphBuffer=await fetchAsset(manifest.graph,'connectome.bin.gz','buffer',onProgress,manifest.assetBase);
    result=parseConnectomePack(neuronText,classText,graphBuffer,effectiveManifest);
  }
  result.graphTier=tier;
  onProgress({phase:'mapping', message:'Built provenance-labelled sensory, proprioceptive and identified effector populations.',tier});
  return result;
}
