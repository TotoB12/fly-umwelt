import {PlanarHexapodPlant} from './hexapod-plant.js';

/**
 * Compatibility boundary for the modeled VNC/body layer. The current plant is
 * a causal planar hexapod: descending activity coordinates timing, while six
 * identified motor pools are required for force.
 */
export class VncController {
  constructor(_rng,profile='hexapod'){this.profile=profile;this.plant=new PlanarHexapodPlant();}
  setProfile(profile='hexapod'){this.profile=profile;}
  reset(){this.plant.reset();}
  step(input={}){return this.plant.step(input);}
  snapshot(){return {profile:this.profile,...this.plant.snapshot()};}
  serialize(){return {profile:this.profile,plant:this.plant.serialize()};}
  restore(state={}){if(state.profile)this.profile=state.profile;if(state.plant)this.plant.restore(state.plant);else this.plant.restore(state);}
  proprioceptionVector(){return this.plant.proprioceptionVector();}
  footWorldPositions(fly){return this.plant.footWorldPositions(fly);}
}
