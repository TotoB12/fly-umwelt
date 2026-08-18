import test from 'node:test';
import assert from 'node:assert/strict';
import {EthogramHistory} from '../src/ui/ethogram.js';

function snapshot(time,state='walk',extra={}){
  return {
    time,
    fly:{alive:true},
    behavior:{state,reason:`${state} reason`},
    senses:{odorLeft:[0,0,0],odorRight:[0,0,0],touch:[0,0,0],taste:[0,0,0],guidance:{kind:null,confidence:0}},
    retina:{loom:[0,0]},brain:{visualRisk:0},events:[],...extra,
  };
}

test('ethogram coalesces repeated states into bounded segments',()=>{
  const history=new EthogramHistory({maxSeconds:10});
  history.record(snapshot(0,'walk'));history.record(snapshot(1,'walk'));history.record(snapshot(2,'saccade'));history.record(snapshot(3,'saccade'));
  assert.equal(history.segments.length,2);assert.equal(history.segments[0].end,1);assert.equal(history.segments[1].state,'saccade');assert.equal(history.duration(),1);
  history.record(snapshot(15,'rest'));assert(history.segments[0].start>=5);
});

test('ethogram records threshold crossings without duplicating rolling world events',()=>{
  const history=new EthogramHistory();
  const event={time:.5,type:'observer',message:'Airflow stimulus applied.'};
  history.record(snapshot(0));
  history.record(snapshot(1,'walk',{senses:{odorLeft:[.4,0,0],odorRight:[.1,0,0],touch:[.2],taste:[.3],guidance:{kind:'food',confidence:.4}},retina:{loom:[.7]},brain:{visualRisk:.6},events:[event]}));
  history.record(snapshot(2,'walk',{events:[event]}));
  const types=history.markers.map(marker=>marker.type);
  for(const type of ['touch','taste','vision','odor','memory','observer'])assert(types.includes(type));
  assert.equal(history.markers.filter(marker=>marker.label===event.message).length,1);
});

test('ethogram clears automatically when restored simulation time moves backwards',()=>{
  const history=new EthogramHistory();history.record(snapshot(10,'walk'));history.record(snapshot(11,'saccade'));history.record(snapshot(2,'rest'));
  assert.equal(history.segments.length,1);assert.equal(history.segments[0].start,2);assert.equal(history.current().state,'rest');
});
