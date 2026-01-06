const droneWorklet = `
class DroneSoundProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // Multiple oscillator phases for richness
    this.phase1 = 0;
    this.phase2 = 0;
    this.phase3 = 0;
    this.phase4 = 0;
    
    // LFO for subtle modulation
    this.lfoPhase = 0;
    
    // Noise buffer for air turbulence
    this.noiseBuffer = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) {
      this.noiseBuffer[i] = (Math.random() * 2 - 1);
    }
    // Smooth the noise
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 2048; i++) {
        this.noiseBuffer[i] = (this.noiseBuffer[i] + this.noiseBuffer[(i + 1) % 2048]) * 0.5;
      }
    }
    this.noiseIdx = 0;
    
    // Filter state for smoothing
    this.filterState = 0;
    this.windFilterState = 0; // Dedicated filter for wind smoothing
    
    // Constants
    this.dt = 1 / sampleRate;
  }

  static get parameterDescriptors() {
    return [
      { name: 'velocity', defaultValue: 0, minValue: 0, maxValue: 50 },
      { name: 'altitude', defaultValue: 10, minValue: 0, maxValue: 100 }
    ];
  }

  process(inputs, outputs, parameters) {
    const channelL = outputs[0][0];
    const channelR = outputs[0][1];
    const blockSize = channelL.length;
    
    const velocity = parameters.velocity[0];
    const altitude = parameters.altitude[0];
    
    // Base frequency increases with velocity (drone motors spin faster)
    // Typical quadcopter motor frequency range: 80-250 Hz
    const baseFreq = 120 + velocity * 2.5;
    
    // Additional harmonics for the 4 motors
    const freq1 = baseFreq;
    const freq2 = baseFreq * 1.003; // Slight detuning for chorus effect
    const freq3 = baseFreq * 0.998;
    const freq4 = baseFreq * 1.007;
    
    // LFO for subtle wobble (motors not perfectly synchronized)
    const lfoFreq = 3.5 + velocity * 0.1;
    
    // Amplitude based on velocity (louder when moving faster)
    const motorGain = 0.08 + velocity * 0.004;
    
    // Wind/air noise increases with velocity
    const windGain = velocity * 0.006;
    
    // High frequency buzz from propellers
    const buzzFreq = 1200 + velocity * 30;
    
    // Distance attenuation (higher altitude = quieter)
    const distanceAtten = Math.max(0.2, 1.0 - altitude * 0.008);
    
    const { noiseBuffer, dt } = this;
    const PI = Math.PI;
    const TWO_PI = 2 * PI;
    
    let { phase1, phase2, phase3, phase4, lfoPhase, filterState, windFilterState, noiseIdx } = this;

    for (let i = 0; i < blockSize; i++) {
      // Update LFO
      lfoPhase += lfoFreq * dt;
      if (lfoPhase >= 1) lfoPhase -= 1;
      const lfo = Math.sin(lfoPhase * TWO_PI) * 0.015;
      
      // Four motor oscillators with slight detuning
      phase1 += freq1 * dt * (1 + lfo);
      phase2 += freq2 * dt * (1 - lfo * 0.7);
      phase3 += freq3 * dt * (1 + lfo * 0.5);
      phase4 += freq4 * dt * (1 - lfo * 0.3);
      
      if (phase1 >= 1) phase1 -= 1;
      if (phase2 >= 1) phase2 -= 1;
      if (phase3 >= 1) phase3 -= 1;
      if (phase4 >= 1) phase4 -= 1;
      
      // Generate motor sounds (sawtooth waves for harmonic richness)
      const motor1 = (phase1 - 0.5) * 2;
      const motor2 = (phase2 - 0.5) * 2;
      const motor3 = (phase3 - 0.5) * 2;
      const motor4 = (phase4 - 0.5) * 2;
      
      const motorSum = (motor1 + motor2 + motor3 + motor4) * 0.25 * motorGain;
      
      // High frequency propeller buzz
      const buzzPhase = (phase1 * buzzFreq / freq1) % 1.0;
      const buzz = (Math.sin(buzzPhase * TWO_PI) * 0.5 + (buzzPhase - 0.5)) * 0.02;
      
      // Wind/turbulence noise - heavily filtered for smooth, continuous sound
      const rawWind = noiseBuffer[noiseIdx++ & 2047] * windGain;
      windFilterState = windFilterState * 0.95 + rawWind * 0.05; // Strong low-pass
      const wind = windFilterState;
      
      // Combine all elements
      let output = motorSum + buzz + wind;
      
      // Low-pass filter for smoothness
      filterState = filterState * 0.85 + output * 0.15;
      output = filterState;
      
      // Apply distance attenuation
      output *= distanceAtten;
      
      // Soft clipping
      output = Math.tanh(output * 1.5);
      
      // Stereo spread (slight phase difference for width)
      channelL[i] = output;
      if (channelR) {
        const rightPhase = (phase1 + 0.1) % 1.0;
        const stereoMod = Math.sin(rightPhase * TWO_PI) * 0.03;
        channelR[i] = output * (1 + stereoMod);
      }
    }
    
    this.phase1 = phase1;
    this.phase2 = phase2;
    this.phase3 = phase3;
    this.phase4 = phase4;
    this.lfoPhase = lfoPhase;
    this.filterState = filterState;
    this.windFilterState = windFilterState;
    this.noiseIdx = noiseIdx;

    return true;
  }
}

registerProcessor('drone-sound-processor', DroneSoundProcessor);
`

export default droneWorklet
