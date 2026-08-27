const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const wait=(fn,ms=60000,label='condition')=>new Promise((resolve,reject)=>{
  const end=performance.now()+ms;
  const tick=()=>{
    try{const value=fn();if(value)return resolve(value);}catch{}
    if(performance.now()>end)return reject(new Error(`timeout: ${label}`));
    setTimeout(tick,80);
  };
  tick();
});
const mark=(status,detail)=>{
  document.documentElement.dataset.smoke=status;
  document.documentElement.dataset.smokeDetail=detail;
};

(async()=>{
  try{
    const app=await wait(()=>globalThis.__flyCnsLab?.brainReady&&globalThis.__flyCnsLab?.linkReady&&globalThis.__flyCnsLab?.worldSnapshot&&globalThis.__flyCnsLab,90000,'full connectome ready');
    const dataset=app.brainInfo?.dataset||{},counts=app.brainInfo?.counts||{},compute=app.brainInfo?.compute||{};
    if(dataset.testOnly)throw new Error('full-pack probe opened the demo graph');
    const tier=app.brainInfo?.graphTier||{};
    const expected=dataset.id==='banc-v888-whole-cns-tiered-v3'
      ? {neurons:155855,edges:{core:1912731,balanced:3730893,maximal:13366470}[tier.id]}
      : {neurons:139255,edges:2698236};
    if(counts.neurons!==expected.neurons||counts.edges!==expected.edges)throw new Error(`unexpected reference pack ${counts.neurons}/${counts.edges} for ${dataset.id||'unknown'}:${tier.id||'legacy'}`);
    if(!Array.isArray(app.worldSnapshot?.brain?.legs)||app.worldSnapshot.brain.legs.length!==6)throw new Error('whole-CNS motor packet does not expose six leg-effector channels');
    if(!globalThis.crossOriginIsolated)throw new Error('Cloudflare-compatible cross-origin isolation headers are not active');
    if(compute.resolved!=='wasm')throw new Error(`Auto did not select the bundled WebAssembly kernel (${compute.resolved||'unknown'})`);
    if(!compute.calibration?.selected||!compute.calibration?.samples?.length)throw new Error('Auto temporal calibration did not run on the full graph');
    if(compute.calibration.selected!==compute.resolutionResolved)throw new Error('calibration and active resolution disagree');
    if(Math.abs(Number(app.config?.brainDtMs)-Number(compute.brainDtMs))>1e-9)throw new Error('application and worker timestep disagree');

    const bodyBefore=app.worldSnapshot.time,neuralBefore=app.brainSnapshot?.simulatedMs||0;
    document.getElementById('stepButton').click();
    await wait(()=>app.worldSnapshot.time>=bodyBefore+.04,15000,'full-pack closed-loop step');
    await wait(()=>(app.brainSnapshot?.simulatedMs||0)>neuralBefore,15000,'full-pack neural advance');
    if(app.worldSnapshot.runtime.running)throw new Error('single full-pack step started playback');
    if(!Number.isFinite(app.brainSnapshot?.stats?.populationRateHz))throw new Error('full-pack neural statistics are invalid');
    await sleep(120);
    const calibration=compute.calibration.samples.map((sample)=>`${sample.id}:${(sample.load*100).toFixed(0)}%`).join(',');
    mark('passed',`${dataset.shortLabel||dataset.label||'connectome'} ${tier.label||''}: ${counts.neurons.toLocaleString()} neurons / ${counts.edges.toLocaleString()} directed pairs; six-leg motor packet; Auto → ${compute.calibration.selected} at ${compute.brainDtMs} ms [${calibration}]; WASM; isolated; closed-loop step passed`);
  }catch(error){
    console.error(error);
    mark('failed',error.message);
  }
})();
