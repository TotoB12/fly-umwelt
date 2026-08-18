import {gunzipBuffer, gunzipText, parseCsv} from './csv.js';
import {hashString} from './prng.js';
import {ANY_OUTPUT_MASK, OUTPUT_FLAGS, OUTPUT_POPULATION_SPECS, RETINA_RAYS} from './constants.js';

const RAW_BASE = 'https://raw.githubusercontent.com/snedea/flybrain/9191824d17871b7851645782d53d23f213ddb938/data/';
const NT_CODES = Object.freeze({ACH:1, ACETYLCHOLINE:1, GABA:2, GLUT:3, GLUTAMATE:3, DA:4, DOPAMINE:4, OA:5, OCTOPAMINE:5, SER:6, SEROTONIN:6, HISTAMINE:7, HIS:7});

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
  const cache = typeof caches !== 'undefined' ? await caches.open('fly-cns-connectome-v4') : null;
  const hit = cache ? await cache.match(url) : null;
  if (hit) {
    try {
      const buffer = await hit.clone().arrayBuffer();
      await verifyCompressedAsset(buffer, integrity, url, onProgress);
      onProgress({phase:'cache', message:`Using cached ${url.split('/').pop()}`});
      return new Response(buffer, {headers:{'Content-Type':'application/gzip'}});
    } catch (error) {
      await cache.delete(url);
      onProgress({phase:'fallback', message:`Discarded invalid cached ${url.split('/').pop()}: ${error.message}`});
    }
  }
  onProgress({phase:'download', message:`Downloading ${url.split('/').pop()}`});
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(30_000) : undefined;
  const res = await fetch(url, {mode:'cors', cache:'no-cache', signal});
  if (!res.ok) throw new Error(`Unable to download ${url}: HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  await verifyCompressedAsset(buffer, integrity, url, onProgress);
  const response = new Response(buffer, {headers:{'Content-Type':'application/gzip'}});
  if (cache) await cache.put(url, response.clone());
  return response;
}

async function fetchAsset(spec, filename, mode, onProgress, assetBase = self.location.href) {
  const candidates = [];
  if (spec?.local) candidates.push(new URL(spec.local, assetBase).href);
  if (spec?.remote) candidates.push(spec.remote);
  if (Array.isArray(spec?.remotes)) candidates.push(...spec.remotes);
  if (!candidates.length) candidates.push(`${RAW_BASE}${filename}`);
  const uniqueCandidates=[...new Set(candidates.filter(Boolean))];
  const integrity = {
    gitBlobSha1: spec?.gitBlobSha1 || (/^[0-9a-f]{40}$/i.test(spec?.sha || '') ? spec.sha : ''),
    sha256: spec?.sha256 || '',
  };
  let lastError;
  for (const url of uniqueCandidates) {
    try {
      const response = await fetchCompressed(url, onProgress, integrity);
      return mode === 'text' ? gunzipText(response) : gunzipBuffer(response);
    } catch (error) {
      lastError = error;
      onProgress({phase:'fallback', message:`${url.split('/').pop()} unavailable at one source; trying fallback.`});
    }
  }
  throw lastError || new Error(`No source for ${filename}`);
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
    nerve: fieldIndex(h, 'nerve'),
    label: fieldIndex(h, 'label','name'),
    function: fieldIndex(h, 'function','connectivity_tag'),
    sensory: fieldIndex(h, 'sensory_in','sensory_input','sensory'),
    effector: fieldIndex(h, 'effector_out','motor_output','effector_output'),
    neuromere: fieldIndex(h, 'neuromere'),
    hemilineage: fieldIndex(h, 'hemilineage'),
    marker: fieldIndex(h, 'marker'),
  };
  if (columns.root < 0) throw new Error('Classification table has no root_id column.');

  const pops = {};
  const flags = new Uint32Array(N);
  const annotations = new Array(N).fill('unannotated');
  const annotationDetail = new Array(N).fill('');
  const central = [];
  const receptorSpecific = {food:0, water:0, threat:0};
  let visualPrimary = 0, olfactoryPrimary = 0, fallbackGroupsUsed = false, outputFunctionalGroupFallback = false;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const idx = idToIndex.get(cell(row, columns.root));
    if (idx === undefined) continue;
    const flow = cell(row, columns.flow).toLowerCase();
    const sup = cell(row, columns.super).toLowerCase();
    const cls = cell(row, columns.cls).toLowerCase();
    const sub = cell(row, columns.sub).toLowerCase();
    const type = cell(row, columns.type);
    const body = cell(row, columns.body).toLowerCase();
    const nerve = cell(row, columns.nerve).toLowerCase();
    const label = cell(row, columns.label);
    const fn = cell(row, columns.function).toLowerCase();
    const sensory = cell(row, columns.sensory).toLowerCase();
    const effector = cell(row, columns.effector).toLowerCase();
    const neuromere = cell(row, columns.neuromere).toLowerCase();
    const hemilineage = cell(row, columns.hemilineage).toLowerCase();
    const marker = cell(row, columns.marker).toLowerCase();
    const side = normalizeSide(cell(row, columns.side));
    const sideSuffix = sideKey(side);
    const all = `${flow} ${sup} ${cls} ${sub} ${type} ${body} ${nerve} ${label} ${fn} ${sensory} ${effector} ${neuromere} ${hemilineage} ${marker}`.toLowerCase();
    const outputText = `${type} ${label} ${cls} ${sub} ${fn} ${effector} ${body} ${neuromere}`;
    annotations[idx] = type || label || sub || cls || sup || 'unannotated';
    annotationDetail[idx] = [flow,sup,cls,sub,type,cell(row,columns.side),body,nerve,label,fn,sensory,effector,neuromere,hemilineage,marker].filter(Boolean).join(' · ');

    const isAfferent = /afferent/.test(flow) || /sensory/.test(sup) || /sensory/.test(cls) || !!sensory || /primary.?sensory|photoreceptor|olfactory.?receptor|(^|\W)orn(\W|$)|(^|\W)grn(\W|$)/.test(all);
    const isEfferent = /efferent/.test(flow) || /motor/.test(sup) || /motor/.test(cls) || !!effector;
    if (/intrinsic/.test(flow) || (!isAfferent && !isEfferent)) central.push(idx);

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
    if (isMotor && /leg|tars|femur|tibia|coxa|trochanter/.test(all)) {
      append(pops, 'leg_motor', idx); append(pops, `leg_motor_${side < 0 ? 'L' : side > 0 ? 'R' : 'M'}`, idx); flags[idx] |= OUTPUT_FLAGS.LEG_MOTOR;
    }

    for (const spec of OUTPUT_POPULATION_SPECS) {
      if (!spec.pattern.test(outputText)) continue;
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
  return {populations:pops, outputFlags:flags, annotations, annotationDetail, provenance};
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
    ? `${unresolved.length} descending neurons lacked usable left/right annotation. They are available to Natural and Connectome modes through a deterministic root-ID side partition; Evoked mode never uses it.`
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
  {id:8,key:'feeding',label:'Feeding / body output'},
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
  assignKeys(Object.keys(populations).filter((key) => /^(mech|gust|airflow|proprio|thermo|hygro)/.test(key)), 3);
  assignKeys(Object.keys(populations).filter((key) => key.startsWith('endocrine')), 4);
  assignKeys(Object.keys(populations).filter((key) => key.startsWith('olfactory')), 2);
  assignKeys(['visualLeft', 'visualRight', 'visualBoth'], 1);
  assignKeys(Object.keys(populations).filter((key) => key.startsWith('descending') || /^DN/.test(key) || key.startsWith('MDN_')), 7);
  assignKeys(['proboscisMotor'], 8); assign(signals.feeding, 8);

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
    previousPre=pre;post[e]=target;weight[e]=(ntCode[pre]===2||ntCode[pre]===3?-raw:raw);
  }
  while(nextRow<=N)rowPtr[nextRow++]=E;
  const region=new Uint8Array(N),group=new Uint16Array(N);
  for(let i=0;i<N;i++,offset+=3){region[i]=view.getUint8(offset);group[i]=view.getUint16(offset+1,true);}
  return finalizePack({rootIds,ntCode,idToIndex,rowPtr,post,weight,region,group,classText,manifest,E});
}

export function parseShardedConnectomePack(neuronText,classText,shardBuffers,manifest={}) {
  const {rootIds,ntCode,idToIndex}=parseNeuronTable(neuronText),N=rootIds.length;
  if(manifest.neuronCount&&Number(manifest.neuronCount)!==N)throw new Error(`Manifest expected ${manifest.neuronCount} neurons but loaded ${N}.`);
  let E=0;for(const b of shardBuffers){if(b.byteLength%12!==0)throw new Error('Invalid FCNS edge shard length.');E+=b.byteLength/12;}
  if(manifest.edgeCount&&Number(manifest.edgeCount)!==E)throw new Error(`Pack expected ${manifest.edgeCount} edges but contains ${E}.`);
  const rowPtr=new Uint32Array(N+1);
  for(const b of shardBuffers){const v=new DataView(b);for(let o=0;o<b.byteLength;o+=12){const pre=v.getUint32(o,true);if(pre>=N)throw new Error(`Edge source ${pre} outside ${N} neurons.`);rowPtr[pre+1]++;}}
  for(let i=1;i<=N;i++)rowPtr[i]+=rowPtr[i-1];
  const post=new Uint32Array(E),weight=new Float32Array(E),cursor=rowPtr.slice(0,N);
  for(const b of shardBuffers){const v=new DataView(b);for(let o=0;o<b.byteLength;o+=12){const pre=v.getUint32(o,true),target=v.getUint32(o+4,true),raw=Math.abs(v.getFloat32(o+8,true));if(target>=N)throw new Error(`Edge target ${target} outside ${N} neurons.`);if(!Number.isFinite(raw))throw new Error('Non-finite edge weight.');const at=cursor[pre]++;post[at]=target;weight[at]=(ntCode[pre]===2||ntCode[pre]===3?-raw:raw);}}
  const region=new Uint8Array(N).fill(1),group=new Uint16Array(N).fill(60);
  return finalizePack({rootIds,ntCode,idToIndex,rowPtr,post,weight,region,group,classText,manifest,E});
}

export async function loadConnectome(manifest, onProgress = () => {}) {
  onProgress({phase:'metadata', message:'Loading neuron identities, annotations and transmitter predictions…'});
  const [neuronText,classText] = await Promise.all([
    fetchAsset(manifest.neurons,'neurons.csv.gz','text',onProgress,manifest.assetBase),
    fetchAsset(manifest.classification,'classification.csv.gz','text',onProgress,manifest.assetBase),
  ]);
  let result;
  if(Array.isArray(manifest.graph?.shards)){
    onProgress({phase:'graph',message:`Loading ${manifest.graph.shards.length} whole-CNS edge shards…`});
    const buffers=[];
    for(let i=0;i<manifest.graph.shards.length;i++)buffers.push(await fetchAsset(manifest.graph.shards[i],`edges-${String(i).padStart(3,'0')}.bin.gz`,'buffer',onProgress,manifest.assetBase));
    result=parseShardedConnectomePack(neuronText,classText,buffers,manifest);
  }else{
    onProgress({phase:'graph',message:'Loading weighted whole-connectome graph…'});
    const graphBuffer=await fetchAsset(manifest.graph,'connectome.bin.gz','buffer',onProgress,manifest.assetBase);
    result=parseConnectomePack(neuronText,classText,graphBuffer,manifest);
  }
  onProgress({phase:'mapping', message:'Built provenance-labelled sensory and neural-output populations.'});
  return result;
}
