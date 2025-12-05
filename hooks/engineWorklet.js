
export const workletCode = `
class AeroSonicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.phase = 0;
    this.cylinders = 6; // Default to Toyota V6 layout
    
    // Physics state
    this.exhaustBuffer = new Float32Array(48000 * 0.25); // Slightly longer buffer for smoother tail
    this.exhaustHead = 0;
    this.filterState = 0; // For simple LPF
    
    // Pre-calculated noise for efficiency
    this.noiseBuffer = new Float32Array(4096);
    for (let i = 0; i < 4096; i++) this.noiseBuffer[i] = (Math.random() * 2 - 1);
    
    // Smooth the noise buffer to reduce harshness (simple lowpass)
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4096; i++) {
        const next = this.noiseBuffer[(i + 1) % 4096];
        this.noiseBuffer[i] = (this.noiseBuffer[i] + next) * 0.5;
      }
    }
    this.noiseIdx = 0;
    
    // Pre-calculate cylinder offsets with jitter
    this.cylinderOffsets = new Float32Array(12); // Support up to 12 cylinders
    this.updateCylinderOffsets();
    
    // Constants
    this.invSampleRate = 1 / sampleRate;
    this.speedOfSoundInv = 1 / 343; // Inverse for multiplication instead of division
    
    // Valve clatter state - use deterministic pattern instead of random per-sample
    this.clatterPhase = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === 'UPDATE_GEOMETRY') {
        this.cylinders = e.data.payload.cylinders;
        this.updateCylinderOffsets();
      }
    };
  }
  
  updateCylinderOffsets() {
    const invCylinders = 1 / this.cylinders;
    for (let c = 0; c < this.cylinders; c++) {
      const jitter = (c & 1) === 0 ? 0.005 : -0.005; // Keep even-fire smooth but not robotic
      this.cylinderOffsets[c] = (c * invCylinders) + jitter;
    }
  }

  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 1000, minValue: 0, maxValue: 12000 },
      { name: 'load', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'throttle', defaultValue: 0.1, minValue: 0, maxValue: 1 },
      { name: 'displacement', defaultValue: 2.0, minValue: 0.5, maxValue: 8.0 },
      { name: 'resonance', defaultValue: 1.5, minValue: 0.1, maxValue: 5.0 }
    ];
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const channelL = output[0];
    const channelR = output[1];
    const blockSize = channelL.length;
    
    // Check if parameters are k-rate (constant) or a-rate (per-sample)
    const rpmArr = parameters.rpm;
    const loadArr = parameters.load;
    const throttleArr = parameters.throttle;
    const resonanceArr = parameters.resonance;
    const displacementArr = parameters.displacement;
    
    const rpmIsConstant = rpmArr.length === 1;
    const loadIsConstant = loadArr.length === 1;
    const throttleIsConstant = throttleArr.length === 1;
    const resIsConstant = resonanceArr.length === 1;
    const dispIsConstant = displacementArr.length === 1;
    
    // Cache constant values
    const constRpm = rpmArr[0];
    const constLoad = loadArr[0];
    const constThrottle = throttleArr[0];
    const constRes = resonanceArr[0];
    const constDisp = displacementArr[0];
    
    // Pre-calculate values that stay constant if params are k-rate
    const constSqrtLoad = Math.sqrt(constLoad);
    const constRpmCompensation = (constRpm * 0.00005); // /8000 * 0.4
    const constEffectiveGain = Math.min(1.0, constLoad + constRpmCompensation);
    const constCombustionGain = constEffectiveGain * constDisp * 0.5;
    const constIntakeGain = constThrottle * 0.02; // Slightly brighter intake
    const constFeedbackAmt = 0.65 + (constThrottle * 0.1);
    const constDelaySamples = Math.max(8, Math.floor(constRes * this.speedOfSoundInv * sampleRate) | 0);
    const constClatterGain = constRpm * 0.0000025; // 0.02 / 8000

    const dt = this.invSampleRate;
    const bufferLen = this.exhaustBuffer.length;
    const exhaustBuffer = this.exhaustBuffer;
    const noiseBuffer = this.noiseBuffer;
    const cylinderOffsets = this.cylinderOffsets;
    const cylinders = this.cylinders;
    const PI = Math.PI;
    
    let phase = this.phase;
    let exhaustHead = this.exhaustHead;
    let filterState = this.filterState;
    let noiseIdx = this.noiseIdx;
    let clatterPhase = this.clatterPhase;

    for (let i = 0; i < blockSize; i++) {
      // Get current parameter values
      const currentRpm = rpmIsConstant ? constRpm : rpmArr[i];
      const currentLoad = loadIsConstant ? constLoad : loadArr[i];
      const currentThrottle = throttleIsConstant ? constThrottle : throttleArr[i];
      const currentRes = resIsConstant ? constRes : resonanceArr[i];
      const currentDisp = dispIsConstant ? constDisp : displacementArr[i];

      // Derived values - use pre-calculated if constant
      const sqrtLoad = loadIsConstant ? constSqrtLoad : Math.sqrt(currentLoad);
      const combustionGain = (rpmIsConstant && loadIsConstant && dispIsConstant) 
        ? constCombustionGain 
        : Math.min(1.0, currentLoad + currentRpm * 0.00005) * currentDisp * 0.5;
      const intakeGain = throttleIsConstant ? constIntakeGain : currentThrottle * 0.02;
      const feedbackAmt = throttleIsConstant ? constFeedbackAmt : 0.65 + (currentThrottle * 0.1);
      const delaySamples = resIsConstant ? constDelaySamples : Math.max(8, (currentRes * this.speedOfSoundInv * sampleRate) | 0);
      const clatterGain = rpmIsConstant ? constClatterGain : currentRpm * 0.0000025;

      // 1. Engine Cycle Calculation
      const cycleFreq = (currentRpm > 60 ? currentRpm : 60) * 0.008333333; // /120
      phase += cycleFreq * dt;
      if (phase >= 1) phase -= 1;

      // 2. Combustion Synthesis
      let combustion = 0;
      const noiseLoadMix = 0.2 * sqrtLoad;
      
      for (let c = 0; c < cylinders; c++) {
        // Local phase shifted for this cylinder
        let p = phase - cylinderOffsets[c] + 1.0;
        if (p >= 1.0) p -= 1.0;
        
        // Firing Window
        if (p < 0.15) {
           const t = p * 6.666666667; // / 0.15
           
           // Kick + Explosion
           const kick = Math.sin(t * PI);
           const noiseVal = noiseBuffer[noiseIdx & 4095];
           noiseIdx++;
           const explosion = noiseVal * Math.exp(-t * 3);
           
           combustion += (kick * 0.6) + (explosion * noiseLoadMix);
        }
      }

      combustion *= combustionGain;

      // 3. Intake Noise
      const intakeNoise = noiseBuffer[(noiseIdx + 100) & 4095] * intakeGain;

      // 4. Exhaust Waveguide
      let delayIdx = exhaustHead - delaySamples;
      if (delayIdx < 0) delayIdx += bufferLen;
      const delayedSignal = exhaustBuffer[delayIdx];

      const input = combustion + intakeNoise;
      
      // Feedback Loop with Lowpass Filter
      const filteredFeedback = (delayedSignal * 0.25) + (filterState * 0.75);
      filterState = filteredFeedback;
      
      // Soft Clip
      let combined = input + (filteredFeedback * feedbackAmt);
      combined = Math.tanh(combined);
      
      exhaustBuffer[exhaustHead] = combined;
      exhaustHead++;
      if (exhaustHead >= bufferLen) exhaustHead = 0;

      // 5. Final Output
      let finalSig = combustion * 0.75 + combined * 0.65;
      
      // Deterministic valve clatter using phase instead of random
      clatterPhase += currentRpm * 0.0001;
      if (clatterPhase >= 1.0) {
        clatterPhase -= 1.0;
        finalSig += (noiseBuffer[(noiseIdx + 50) & 4095] - 0.5) * clatterGain;
      }

      channelL[i] = finalSig;
      if (channelR) channelR[i] = finalSig;
    }
    
    // Write back state
    this.phase = phase;
    this.exhaustHead = exhaustHead;
    this.filterState = filterState;
    this.noiseIdx = noiseIdx;
    this.clatterPhase = clatterPhase;

    return true;
  }
}

registerProcessor('aerosonic-processor', AeroSonicProcessor);
`
