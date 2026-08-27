#!/usr/bin/env python3
"""Build a deterministic synthetic pack that exercises the production parser,
whole-CNS engine, six identified leg outputs and body feedback boundary.
The fixture is test-only and is never presented as biological data.
"""
from __future__ import annotations
import csv,gzip,io,json,struct
from pathlib import Path

OUT=Path(__file__).resolve().parents[1]/'public'/'data'
N=120
ids=[f'fixture-{i:03d}' for i in range(N)]
nt=['ACH']*N
for i in [56,57,58,59,60,61,104,105]: nt[i]='GABA'

columns=['root_id','flow','super_class','class','sub_class','cell_type','side','body_part_sensory','body_part_effector','peripheral_target_type','function','function_detailed','neuromere','proofread','roughly_proofread','status']
rows=[]
def ann(i,flow='intrinsic',sup='central',cls='interneuron',sub='',typ='',side='',body_sensory='',body_effector='',peripheral='',function='',detail='',neuromere=''):
    rows.append([ids[i],flow,sup,cls,sub,typ,side,body_sensory,body_effector,peripheral,function,detail,neuromere,'TRUE','FALSE',''])

# Primary sensory inputs.
for i in range(0,8): ann(i,'afferent','sensory','visual','photoreceptor',f'R1R6-L-{i}','left')
for i in range(8,16): ann(i,'afferent','sensory','visual','photoreceptor',f'R1R6-R-{i}','right')
for i in range(16,20): ann(i,'afferent','sensory','olfactory','orn',f'ORN-food-L-{i}','left',function='food odor receptor')
for i in range(20,24): ann(i,'afferent','sensory','olfactory','orn',f'ORN-food-R-{i}','right',function='food odor receptor')
leg_specs=[('LF','left','front_leg','T1'),('LM','left','middle_leg','T2'),('LH','left','hind_leg','T3'),('RF','right','front_leg','T1'),('RM','right','middle_leg','T2'),('RH','right','hind_leg','T3')]
for offset,(leg,side,part,neuromere) in enumerate(leg_specs):
    ann(24+offset,'afferent','sensory','leg_sensory_neuron','tactile',f'{leg} bristle',side,part,peripheral='bristle',function='tactile contact',detail='tactile bristle',neuromere=neuromere)
    ann(30+offset,'afferent','sensory','leg_sensory_neuron','chordotonal',f'{leg} chordotonal',side,part,peripheral='chordotonal',function='proprioception',detail='joint_angle direction mechanical_strain vibro_position',neuromere=neuromere)
for i in range(36,38): ann(i,'afferent','sensory','gustatory','sweet',f'GRN-sweet-{i}',function='sweet taste')
for i in range(38,40): ann(i,'afferent','sensory','gustatory','water',f'GRN-water-{i}',function='water taste')
for i in range(40,48): ann(i,'intrinsic','endocrine','pars_intercerebralis','',f'endocrine-{i}',function='energy water fatigue interoception')
for i in range(48,72): ann(i,'intrinsic','central','interneuron','',f'central-{i}','left' if i%2==0 else 'right')

# Identified output classes.
ann(72,'efferent','descending','descending','forward','oDN1')
ann(73,'efferent','descending','descending','turn','DNa02','left')
ann(74,'efferent','descending','descending','turn','DNa02','right')
ann(75,'efferent','descending','descending','turn','DNa01','left')
ann(76,'efferent','descending','descending','turn','DNa01','right')
ann(77,'efferent','descending','descending','turning stride','DNg13','left')
ann(78,'efferent','descending','descending','turning stride','DNg13','right')
ann(79,'efferent','descending','descending','backward','MDN','left')
ann(80,'efferent','descending','descending','backward','MDN','right')
ann(81,'efferent','descending','descending','escape','DNp09')
ann(82,'efferent','descending','descending','escape','giant fiber')
ann(83,'efferent','motor','brain_motor_neuron','proboscis','MN9 proboscis',body_effector='proboscis',peripheral='muscle')
ann(84,'efferent','motor','brain_motor_neuron','ingestion','water motor ingestion',body_effector='proboscis',peripheral='muscle')
ann(85,'efferent','descending','descending','locomotion','DNg walk')
ann(86,'efferent','descending','descending','halt','BRK')
ann(87,'efferent','motor','leg_motor_neuron','backward motor','backward motor neuron',body_effector='leg',peripheral='muscle')

motor_indices={}
for leg_index,(leg,side,part,neuromere) in enumerate(leg_specs):
    motor_indices[leg]=[]
    for copy in range(2):
        idx=88+leg_index*2+copy;motor_indices[leg].append(idx)
        action='flex_femur_tibia_joint' if copy==0 else 'extend_femur_tibia_joint'
        target='tibia_flexor_muscle' if copy==0 else 'tibia_extensor_muscle'
        ann(idx,'efferent','motor','leg_motor_neuron','leg motor neuron',f'{leg} motor {copy}',side,body_effector=part,peripheral=target,function='leg motor',detail=action,neuromere=neuromere)
for i in range(100,N): ann(i,'intrinsic','central','interneuron','',f'central-{i}','left' if i%2==0 else 'right')

edges=[]
def edge(a,b,w=28): edges.append((a,b,float(w)))
# Sensory pathways to central and descending populations.
for i in range(0,8): edge(i,48+i%6,18);edge(i,73,26);edge(i,75,17)
for i in range(8,16): edge(i,54+i%6,18);edge(i,74,26);edge(i,76,17)
for i in range(16,20): edge(i,48+i%4,22);edge(i,73,20);edge(i,72,19)
for i in range(20,24): edge(i,54+i%4,22);edge(i,74,20);edge(i,72,19)
for leg_i,(leg,_,_,_) in enumerate(leg_specs):
    tactile=24+leg_i;proprio=30+leg_i
    central=48+leg_i
    edge(tactile,central,24);edge(proprio,central,18)
    for motor in motor_indices[leg]: edge(tactile,motor,18);edge(proprio,motor,16)
    # Crossed tactile bias gives the reduced model a causal avoidance pathway.
    edge(tactile,74 if leg.startswith('L') else 73,15)
for i in range(36,38): edge(i,83,30)
for i in range(38,40): edge(i,84,30)
for i in range(40,44): edge(i,72,16);edge(i,85,19)
for i in range(44,48): edge(i,79+(i%2),14)

# Recurrent central network and descending drive.
for i in range(48,72):
    edge(i,48+(i+1-48)%24,12);edge(i,48+(i+5-48)%24,9)
    edge(i,85,12)
    if i%2==0: edge(i,72,10)
    else: edge(i,73 if i%4==1 else 74,9)
for i in range(100,N):
    edge(i,48+(i%24),10);edge(48+(i%24),i,10);edge(i,85,9)

# Descending neurons coordinate and recruit explicit leg motor pools.
for leg_i,(leg,side,_,_) in enumerate(leg_specs):
    for motor in motor_indices[leg]:
        edge(85,motor,32);edge(72,motor,21)
        edge(73 if side=='left' else 74,motor,12)
        edge(75 if side=='left' else 76,motor,9)
        edge(77 if side=='left' else 78,motor,8)
# Motor feedback remains weak; movement requires motor-pool activation.
for leg in motor_indices:
    for motor in motor_indices[leg]: edge(motor,48+(motor%24),4)
edge(79,87,30);edge(80,87,30);edge(86,56,8)
edges.sort()

OUT.mkdir(parents=True,exist_ok=True)
def write_gzip(path,data):path.write_bytes(gzip.compress(data,compresslevel=9,mtime=0))

buffer=io.StringIO(newline='');w=csv.writer(buffer);w.writerow(['root_id','nt_type']);w.writerows(zip(ids,nt));write_gzip(OUT/'fixture-neurons.csv.gz',buffer.getvalue().encode())
buffer=io.StringIO(newline='');w=csv.writer(buffer);w.writerow(columns);w.writerows(rows);write_gzip(OUT/'fixture-classification.csv.gz',buffer.getvalue().encode())
graph=bytearray(struct.pack('<II',N,len(edges)))
for a,b,wgt in edges:graph.extend(struct.pack('<IIf',a,b,wgt))
for i in range(N):
    region=0 if i<40 else 2 if i<48 else 3 if 72<=i<=99 else 1
    group=0 if i<16 else 6 if i<24 else 10 if i<36 else 32 if i<38 else 34 if i<40 else 37 if i<48 else 35 if 72<=i<=87 else 56 if 83<=i<=99 else 60
    graph.extend(struct.pack('<BH',region,group))
write_gzip(OUT/'fixture.bin.gz',bytes(graph))
manifest={'id':'deterministic-fixture','label':f'{N}-neuron validation fixture','anatomy':'test-only synthetic graph','graph':{'local':'./data/fixture.bin.gz'},'classification':{'local':'./data/fixture-classification.csv.gz'},'neurons':{'local':'./data/fixture-neurons.csv.gz'},'testOnly':True,'neuronCount':N,'edgeCount':len(edges)}
(OUT/'fixture-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'fixture: {N} neurons, {len(edges)} edges, 12 explicit leg motors')
