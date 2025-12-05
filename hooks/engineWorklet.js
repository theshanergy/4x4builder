
export const workletCode = `
class AeroSonicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.phase = 0;
    this.cylinders = 6;
    
    // Exhaust resonance buffer
    this.exhaustBuffer = new Float32Array(48000 * 0.2);
    this.exhaustHead = 0;
    this.filterState = 0;
    
    // Pre-calculated smoothed noise
    this.noiseBuffer = new Float32Array(4096);
    for (let i = 0; i < 4096; i++) this.noiseBuffer[i] = (Math.random() * 2 - 1);
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4096; i++) {
        this.noiseBuffer[i] = (this.noiseBuffer[i] + this.noiseBuffer[(i + 1) % 4096]) * 0.5;
      }
    }
    this.noiseIdx = 0;
    
    // Pre-calculate cylinder offsets
    this.cylinderOffsets = new Float32Array(this.cylinders);
    for (let c = 0; c < this.cylinders; c++) {
      this.cylinderOffsets[c] = c / this.cylinders + ((c & 1) ? -0.005 : 0.005);
    }
    
    // Constants
    this.dt = 1 / sampleRate;
    this.delaySamples = Math.floor(2.2 / 343 * sampleRate); // Fixed exhaust length
  }

  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 1000, minValue: 0, maxValue: 12000 },
      { name: 'load', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'throttle', defaultValue: 0.1, minValue: 0, maxValue: 1 }
    ];
  }

  process(inputs, outputs, parameters) {
    const channelL = outputs[0][0];
    const channelR = outputs[0][1];
    const blockSize = channelL.length;
    
    // Get parameter values (use first value - they're smoothed externally)
    const rpm = parameters.rpm[0];
    const load = parameters.load[0];
    const throttle = parameters.throttle[0];
    
    // Pre-calculate constants for this block
    const sqrtLoad = Math.sqrt(load);
    const combustionGain = Math.min(1.0, load + rpm * 0.00005) * 2.0; // Fixed displacement of 4.0 * 0.5
    const intakeGain = throttle * 0.02;
    const feedbackAmt = 0.65 + throttle * 0.1;
    const cycleFreq = Math.max(rpm, 60) / 120;
    
    const { exhaustBuffer, noiseBuffer, cylinderOffsets, cylinders, delaySamples, dt } = this;
    const bufferLen = exhaustBuffer.length;
    const PI = Math.PI;
    
    let { phase, exhaustHead, filterState, noiseIdx } = this;

    for (let i = 0; i < blockSize; i++) {
      // Engine cycle
      phase += cycleFreq * dt;
      if (phase >= 1) phase -= 1;

      // Combustion from all cylinders
      let combustion = 0;
      const noiseLoadMix = 0.2 * sqrtLoad;
      
      for (let c = 0; c < cylinders; c++) {
        let p = phase - cylinderOffsets[c] + 1.0;
        if (p >= 1.0) p -= 1.0;
        
        if (p < 0.15) {
          const t = p / 0.15;
          const kick = Math.sin(t * PI);
          const explosion = noiseBuffer[noiseIdx++ & 4095] * Math.exp(-t * 3);
          combustion += kick * 0.6 + explosion * noiseLoadMix;
        }
      }
      combustion *= combustionGain;

      // Intake noise
      const intakeNoise = noiseBuffer[(noiseIdx + 100) & 4095] * intakeGain;

      // Exhaust waveguide with feedback
      let delayIdx = exhaustHead - delaySamples;
      if (delayIdx < 0) delayIdx += bufferLen;
      
      const filteredFeedback = exhaustBuffer[delayIdx] * 0.25 + filterState * 0.75;
      filterState = filteredFeedback;
      
      let combined = Math.tanh(combustion + intakeNoise + filteredFeedback * feedbackAmt);
      exhaustBuffer[exhaustHead] = combined;
      exhaustHead = (exhaustHead + 1) % bufferLen;

      // Final mix
      const out = combustion * 0.75 + combined * 0.65;
      channelL[i] = out;
      if (channelR) channelR[i] = out;
    }
    
    this.phase = phase;
    this.exhaustHead = exhaustHead;
    this.filterState = filterState;
    this.noiseIdx = noiseIdx;

    return true;
  }
}

registerProcessor('aerosonic-processor', AeroSonicProcessor);
`
