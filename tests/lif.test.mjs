import test from 'node:test';import assert from 'node:assert/strict';import {lifStep,connectionDelta} from '../src/core/lif-reference.js';
test('published relative LIF state decays toward rest',()=>{const a=lifStep(4,0,5);assert(a.v<4&&a.v>0);const b=lifStep(0,4,5);assert(b.v>0&&b.g<4);});
test('analytical passive integration composes across temporal resolutions',()=>{const one=lifStep(2.75,5.2,2),half=lifStep(2.75,5.2,1),two=lifStep(half.v,half.g,1);assert(Math.abs(one.v-two.v)<1e-12);assert(Math.abs(one.g-two.g)<1e-12);});
test('GABA/glutamate-style sign is applied presynaptically',()=>{assert.equal(connectionDelta(10,1),2.75);assert.equal(connectionDelta(10,-1),-2.75);});
