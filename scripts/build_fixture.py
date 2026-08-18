#!/usr/bin/env python3
"""Build a small deterministic data pack that exercises the same loader and CNS engine.
This fixture is synthetic and is never presented as biological data.
"""
from __future__ import annotations
import csv,gzip,io,struct
from pathlib import Path

OUT=Path(__file__).resolve().parents[1]/'public'/'data'
N=96
ids=[f'fixture-{i:03d}' for i in range(N)]
nt=['ACH']*N
for i in [52,53,54,55,60,61]: nt[i]='GABA'

rows=[]
def ann(i,flow='intrinsic',sup='central',cls='interneuron',sub='',typ='',side=''):
    rows.append([ids[i],flow,sup,cls,sub,typ,side])
# visual
for i in range(0,8): ann(i,'afferent','sensory','visual','photoreceptor',f'R1R6-L-{i}','left')
for i in range(8,16): ann(i,'afferent','sensory','visual','photoreceptor',f'R1R6-R-{i}','right')
# olfactory
for i in range(16,20): ann(i,'afferent','sensory','olfactory','orn',f'ORN-food-L-{i}','left')
for i in range(20,24): ann(i,'afferent','sensory','olfactory','orn',f'ORN-food-R-{i}','right')
# mech
for i in range(24,28): ann(i,'afferent','sensory','mechanosensory','bristle',f'bristle-L-{i}','left')
for i in range(28,32): ann(i,'afferent','sensory','mechanosensory','bristle',f'bristle-R-{i}','right')
# taste
for i in range(32,34): ann(i,'afferent','sensory','gustatory','sweet',f'GRN-sweet-{i}','')
for i in range(34,36): ann(i,'afferent','sensory','gustatory','water',f'GRN-water-{i}','')
# endocrine
for i in range(36,44): ann(i,'intrinsic','endocrine','pars_intercerebralis','',f'endocrine-{i}','')
# central
for i in range(44,64): ann(i,'intrinsic','central','interneuron','',f'central-{i}','left' if i%2==0 else 'right')
# outputs
ann(64,'efferent','descending','descending','forward','oDN1','')
ann(65,'efferent','descending','descending','turn','DNa02','left')
ann(66,'efferent','descending','descending','turn','DNa02','right')
ann(67,'efferent','descending','descending','turn','DNa01','left')
ann(68,'efferent','descending','descending','turn','DNa01','right')
ann(69,'efferent','descending','descending','backward','MDN','left')
ann(70,'efferent','descending','descending','backward','MDN','right')
ann(71,'efferent','descending','descending','escape','DNp09','')
ann(72,'efferent','descending','descending','escape','giant fiber','')
ann(73,'efferent','motor','brain_motor_neuron','proboscis','MN9 proboscis','')
ann(74,'efferent','motor','brain_motor_neuron','ingestion','water motor ingestion','')
ann(75,'efferent','descending','descending','locomotion','DNg walk','')
for i in range(76,N): ann(i,'intrinsic','central','interneuron','',f'central-{i}','')

edges=[]
def edge(a,b,w=28): edges.append((a,b,float(w)))
# sensory to paired integration and outputs
for i in range(0,8): edge(i,44+i%4,18); edge(i,65,26); edge(i,67,18)
for i in range(8,16): edge(i,48+i%4,18); edge(i,66,26); edge(i,68,18)
for i in range(16,20): edge(i,44+i%4,22);edge(i,65,24);edge(i,64,20)
for i in range(20,24): edge(i,48+i%4,22);edge(i,66,24);edge(i,64,20)
for i in range(24,28): edge(i,69,30);edge(i,66,18)
for i in range(28,32): edge(i,70,30);edge(i,65,18)
for i in range(32,34): edge(i,73,30)
for i in range(34,36): edge(i,74,30)
for i in range(36,40): edge(i,64,18);edge(i,75,18)
for i in range(40,44): edge(i,69+(i%2),15)
# recurrent central network
for i in range(44,64):
    edge(i,44+(i+1-44)%20,12)
    edge(i,44+(i+5-44)%20,9)
    if i%2==0: edge(i,64,12)
    else: edge(i,65 if i%4==1 else 66,10)
for i in range(76,N):
    edge(i,44+(i%20),10)
    edge(44+(i%20),i,10)
# output feedback (weak)
edge(64,50,5);edge(65,52,5);edge(66,53,5);edge(69,54,5);edge(70,55,5)
edges.sort()

OUT.mkdir(parents=True,exist_ok=True)

def write_gzip(path, data):
    # A fixed mtime keeps fixture generation byte-for-byte reproducible.
    path.write_bytes(gzip.compress(data, compresslevel=9, mtime=0))

buffer=io.StringIO(newline='')
w=csv.writer(buffer);w.writerow(['root_id','nt_type']);w.writerows(zip(ids,nt))
write_gzip(OUT/'fixture-neurons.csv.gz',buffer.getvalue().encode('utf-8'))

buffer=io.StringIO(newline='')
w=csv.writer(buffer);w.writerow(['root_id','flow','super_class','class','sub_class','cell_type','side']);w.writerows(rows)
write_gzip(OUT/'fixture-classification.csv.gz',buffer.getvalue().encode('utf-8'))

graph=bytearray(struct.pack('<II',N,len(edges)))
for a,b,w in edges: graph.extend(struct.pack('<IIf',a,b,w))
for i in range(N):
    region=0 if i<36 else 2 if i<44 else 3 if 64<=i<=75 else 1
    group=0 if i<16 else 6 if i<24 else 10 if i<32 else 32 if i<34 else 34 if i<36 else 37 if i<44 else 35 if 64<=i<=72 or i==75 else 56 if i in (73,74) else 60
    graph.extend(struct.pack('<BH',region,group))
write_gzip(OUT/'fixture.bin.gz',bytes(graph))
print(f'fixture: {N} neurons, {len(edges)} edges')
