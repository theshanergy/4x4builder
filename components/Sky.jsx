import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, Vector3 } from 'three'

// Atmospheric sky shader with procedural clouds
const atmosphericSkyVertexShader = `
varying vec3 vDirection;

void main() {
    // Use local position as direction - this stays constant regardless of where the sky sphere is
    vDirection = position;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position.z = gl_Position.w;
}
`

const atmosphericSkyFragmentShader = `
varying vec3 vDirection;

uniform vec3 sunDirection;
uniform float time;

const float PI = 3.14159265359;
const vec3 UP = vec3(0.0, 1.0, 0.0);

// Sky color parameters - clear desert sky
const vec3 SKY_TOP = vec3(0.35, 0.55, 0.82);      // Deep blue at zenith
const vec3 SKY_HORIZON = vec3(0.75, 0.85, 0.95);  // Pale blue-white at horizon
const vec3 SUN_COLOR = vec3(1.0, 0.95, 0.85);

// Hash for noise
float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// 3D noise
float noise(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    
    float n = mix(
        mix(mix(hash(p), hash(p + vec3(1,0,0)), f.x),
            mix(hash(p + vec3(0,1,0)), hash(p + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash(p + vec3(0,0,1)), hash(p + vec3(1,0,1)), f.x),
            mix(hash(p + vec3(0,1,1)), hash(p + vec3(1,1,1)), f.x), f.y),
        f.z
    );
    return n;
}

// FBM for clouds
float fbm(vec3 p) {
    float f = 0.0;
    f += 0.5000 * noise(p); p *= 2.02;
    f += 0.2500 * noise(p); p *= 2.03;
    f += 0.1250 * noise(p); p *= 2.01;
    f += 0.0625 * noise(p);
    return f / 0.9375;
}

// Henyey-Greenstein phase function
float henyeyGreenstein(float cosTheta, float g) {
    float g2 = g * g;
    return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
}

// Clean sky gradient
vec3 skyGradient(vec3 dir, vec3 sunDir) {
    float elevation = max(0.0, dir.y);
    
    // Smooth gradient from horizon to zenith
    float skyBlend = pow(elevation, 0.5);
    vec3 skyColor = mix(SKY_HORIZON, SKY_TOP, skyBlend);
    
    // Subtle sun influence - warm glow near sun
    float sunDot = max(0.0, dot(dir, sunDir));
    float sunGlow = pow(sunDot, 8.0) * 0.3;
    skyColor += SUN_COLOR * sunGlow * (1.0 - elevation * 0.5);
    
    // Very subtle horizon haze
    float horizonHaze = pow(1.0 - elevation, 12.0) * 0.15;
    skyColor = mix(skyColor, vec3(0.9, 0.92, 0.95), horizonHaze);
    
    // Sun disk
    float sunDisk = smoothstep(0.9997, 0.9999, sunDot);
    skyColor += SUN_COLOR * sunDisk * 15.0;
    
    return skyColor;
}

// Wispy cloud rendering - subtle and thin
vec4 wispyClouds(vec3 dir, vec3 sunDir) {
    if (dir.y < 0.02) return vec4(0.0);
    
    // Project ray onto cloud plane
    float t = 0.5 / dir.y;
    vec3 cloudPos = dir * t;
    
    // Animate clouds slowly
    vec2 windOffset = vec2(time * 0.008, time * 0.003);
    vec2 uv = cloudPos.xz * 0.8 + windOffset;
    
    // Wispy cloud noise - stretched horizontally
    vec3 noisePos1 = vec3(uv.x * 2.0, uv.y * 0.5, time * 0.01);
    vec3 noisePos2 = vec3(uv.x * 1.5 + 3.0, uv.y * 0.4, time * 0.015);
    
    float n1 = fbm(noisePos1);
    float n2 = fbm(noisePos2 * 1.5);
    
    // Combine for wispy effect
    float cloudNoise = n1 * 0.6 + n2 * 0.4;
    
    // Very sparse coverage - mostly clear sky
    float coverage = 0.55;
    float cloudShape = smoothstep(coverage, coverage + 0.15, cloudNoise);
    
    // Make clouds thinner/wispier
    cloudShape *= smoothstep(coverage + 0.3, coverage + 0.1, cloudNoise) * 1.5;
    cloudShape = clamp(cloudShape, 0.0, 1.0);
    
    // Fade clouds at horizon and high up
    float verticalFade = smoothstep(0.02, 0.2, dir.y) * smoothstep(0.9, 0.4, dir.y);
    cloudShape *= verticalFade;
    
    // Cloud lighting - bright white clouds
    float lightIntensity = 0.95 + 0.05 * max(0.0, dot(dir, sunDir));
    
    // Cloud color - very bright white
    vec3 cloudColor = vec3(1.0, 1.0, 1.0) * lightIntensity;
    
    // Very subtle warm tint
    cloudColor += vec3(0.02, 0.01, 0.0) * max(0.0, dot(dir, sunDir));
    
    return vec4(cloudColor, cloudShape * 0.6);
}

void main() {
    vec3 dir = normalize(vDirection);
    vec3 sunDir = normalize(sunDirection);
    
    // Sky color - clean gradient
    vec3 skyColor = skyGradient(dir, sunDir);
    
    // Add wispy clouds
    vec4 cloudLayer = wispyClouds(dir, sunDir);
    
    // Blend clouds with sky
    vec3 finalColor = mix(skyColor, cloudLayer.rgb, cloudLayer.a);
    
    // Ground/below horizon
    if (dir.y < 0.0) {
        vec3 groundColor = vec3(0.85, 0.82, 0.78);
        float groundBlend = smoothstep(-0.01, 0.0, dir.y);
        finalColor = mix(groundColor, finalColor, groundBlend);
    }
    
    // Light tone mapping - keep it bright and clean
    finalColor = pow(finalColor, vec3(0.95));
    
    gl_FragColor = vec4(finalColor, 1.0);
}
`

// Custom Atmospheric Sky component with procedural clouds
const AtmosphericSky = ({ sunPosition = [1, 0.5, 1] }) => {
	const meshRef = useRef()
	const materialRef = useRef()

	const sunDir = useMemo(() => new Vector3(...sunPosition).normalize(), [sunPosition])

	const uniforms = useMemo(
		() => ({
			sunDirection: { value: sunDir },
			time: { value: 0 },
		}),
		[sunDir]
	)

	useFrame((state) => {
		if (materialRef.current) {
			materialRef.current.uniforms.time.value = state.clock.elapsedTime
		}
		// Make sky follow camera so it appears infinite
		if (meshRef.current) {
			meshRef.current.position.copy(state.camera.position)
		}
	})

	return (
		<mesh ref={meshRef} scale={[1, 1, 1]}>
			<sphereGeometry args={[500, 32, 32]} />
			<shaderMaterial
				ref={materialRef}
				uniforms={uniforms}
				vertexShader={atmosphericSkyVertexShader}
				fragmentShader={atmosphericSkyFragmentShader}
				side={BackSide}
				depthWrite={false}
			/>
		</mesh>
	)
}

export default AtmosphericSky
