import { memo } from 'react'
import { ShaderMaterial, Color, FrontSide } from 'three'

// Shared water shader material - single instance for all tiles
export const waterMaterial = new ShaderMaterial({
	uniforms: {
		uTime: { value: 0 },
		uOceanRadius: { value: 300 },
		uWaterColor: { value: new Color(0x1a9fb8) },
		uDeepColor: { value: new Color(0x0d7a8f) },
		uFoamColor: { value: new Color(0xffffff) },
		uFogNear: { value: 10.0 },
		uFogFar: { value: 150.0 },
	},
	vertexShader: `
		varying vec3 vWorldPosition;
		
		void main() {
			vec4 worldPos = modelMatrix * vec4(position, 1.0);
			vWorldPosition = worldPos.xyz;
			gl_Position = projectionMatrix * viewMatrix * worldPos;
		}
	`,
	fragmentShader: `
		uniform float uTime;
		uniform float uOceanRadius;
		uniform vec3 uWaterColor;
		uniform vec3 uDeepColor;
		uniform vec3 uFoamColor;
		uniform float uFogNear;
		uniform float uFogFar;
		
		varying vec3 vWorldPosition;
		
		// Simple noise function for waves
		float hash(vec2 p) {
			return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
		}
		
		float noise(vec2 p) {
			vec2 i = floor(p);
			vec2 f = fract(p);
			f = f * f * (3.0 - 2.0 * f);
			
			float a = hash(i);
			float b = hash(i + vec2(1.0, 0.0));
			float c = hash(i + vec2(0.0, 1.0));
			float d = hash(i + vec2(1.0, 1.0));
			
			return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
		}
		
		void main() {
			// World-space based waves for seamless tiling across tiles
			vec2 worldUV = vWorldPosition.xz * 0.02;
			
			// Layered wave animation
			float wave1 = noise(worldUV * 2.0 + uTime * 0.3);
			float wave2 = noise(worldUV * 4.0 - uTime * 0.2);
			float wave3 = noise(worldUV * 8.0 + uTime * 0.5);
			
			float waves = wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2;
			
			// Distance from center for depth coloring
			float distFromCenter = length(vWorldPosition.xz);
			float depthFactor = smoothstep(uOceanRadius, uOceanRadius + 200.0, distFromCenter);
			
			// Mix water colors based on depth and waves
			vec3 surfaceColor = mix(uWaterColor, uDeepColor, depthFactor);
			surfaceColor = mix(surfaceColor, uFoamColor, waves * 0.15);
			
			// Add some specular-like highlights
			float highlight = pow(wave1 * wave2, 2.0) * 0.3;
			surfaceColor += highlight;
			
			// Apply depth-based opacity - water gets more opaque further from shore
			// This hides the ocean floor and terrain edges in deeper water
			float depthOpacity = smoothstep(uFogNear, uFogFar, distFromCenter);
			float alpha = mix(0.75, 0.98, depthOpacity);
			
			gl_FragColor = vec4(surfaceColor, alpha);
		}
	`,
	transparent: true,
	side: FrontSide,
})

// WaterTile component - purely visual, no physics
// Uses shared material for better performance (no cloning, no per-tile useFrame)
export const WaterTile = memo(({ position, tileSize }) => {
	return (
		<mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
			<planeGeometry args={[tileSize, tileSize]} />
			<primitive object={waterMaterial} attach='material' />
		</mesh>
	)
})
