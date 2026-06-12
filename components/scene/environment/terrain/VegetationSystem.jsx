import { useEffect, useRef, useState, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { InstancedMesh, InstancedBufferAttribute, Sphere, Vector3 } from 'three'
import { RigidBody, CylinderCollider } from '@react-three/rapier'

import useGameStore, { vehicleState } from '../../../../store/gameStore'
import VEGETATION_CONFIG from '../../../../config/vegetation'
import { collectDesiredChunks } from '../../../../utils/vegetation/vegetationChunks'
import { getTerrainWorkerPool } from '../../../../utils/terrain/workerPool'

// Re-evaluate the desired chunk set only after meaningful movement.
const MOVE_THRESHOLD = 16
const UPDATE_INTERVAL = 0.25
// Physics colliders exist for vegetation chunks near the vehicle (the legacy
// system only had them on the closest terrain LOD, a similar radius).
const COLLIDER_DISTANCE = 128
// Extra padding in the per-chunk frustum-culling sphere for plant height.
const BOUNDS_PADDING = 15

/**
 * VegetationSystem — distance-ring streamed instanced vegetation.
 *
 * Chunks are generated in the terrain worker pool (placement sampling is the
 * expensive part) and rendered as one InstancedMesh per (type, chunk, part).
 * Streaming follows the camera; an additional small radius around the vehicle
 * guarantees collider coverage when the camera is elsewhere (drone view).
 * Terrain LOD changes never rebuild vegetation.
 */
const VegetationSystem = ({ vegetationModels }) => {
	const isMobile = useGameStore((state) => state.isMobile)
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)
	const showVegetation = !performanceDegraded && !isMobile && Boolean(vegetationModels)

	const [, setVersion] = useState(0)
	const bump = useCallback(() => setVersion((v) => v + 1), [])

	const chunksRef = useRef(new Map()) // key -> { desc, meshes, count, colliderData }
	const pendingRef = useRef(new Map()) // key -> pool job handle
	const eligibleCollidersRef = useRef(new Set()) // chunk keys whose colliders are active
	const lastEvalRef = useRef({ camX: null, camZ: null, vehX: null, vehZ: null, time: -Infinity })

	const colliderInReach = (desc, vehX, vehZ) =>
		Math.hypot(desc.chunkX - vehX, desc.chunkZ - vehZ) <= COLLIDER_DISTANCE + desc.chunkSize * 0.71

	const disposeChunk = (chunk) => {
		if (chunk.meshes) {
			for (const mesh of chunk.meshes) mesh.dispose()
		}
	}

	const clearAll = useCallback(() => {
		for (const [, handle] of pendingRef.current) handle.cancel()
		pendingRef.current.clear()
		for (const [, chunk] of chunksRef.current) disposeChunk(chunk)
		chunksRef.current.clear()
		eligibleCollidersRef.current.clear()
		lastEvalRef.current = { camX: null, camZ: null, vehX: null, vehZ: null, time: -Infinity }
	}, [])

	// Dispose everything on unmount / when the system is disabled or models change
	useEffect(() => {
		if (!showVegetation) clearAll()
		return clearAll
	}, [showVegetation, vegetationModels, clearAll])

	useFrame(({ camera, clock }) => {
		if (!showVegetation) return

		const time = clock.getElapsedTime()
		const last = lastEvalRef.current
		if (time - last.time < UPDATE_INTERVAL) return

		const camX = camera.position.x
		const camZ = camera.position.z
		const vehX = vehicleState.position.x
		const vehZ = vehicleState.position.z

		if (last.camX !== null) {
			const camMoved = Math.hypot(camX - last.camX, camZ - last.camZ)
			const vehMoved = Math.hypot(vehX - last.vehX, vehZ - last.vehZ)
			if (camMoved < MOVE_THRESHOLD && vehMoved < MOVE_THRESHOLD) return
		}
		lastEvalRef.current = { camX, camZ, vehX, vehZ, time }

		// --- Desired chunk set: camera rings + collider zone around vehicle ---
		const desired = new Map()
		VEGETATION_CONFIG.forEach((config, typeIndex) => {
			const list = []
			collectDesiredChunks(typeIndex, config, camX, camZ, list)
			if (config.collider) {
				collectDesiredChunks(typeIndex, config, vehX, vehZ, list, COLLIDER_DISTANCE)
			}
			for (const desc of list) {
				const existing = desired.get(desc.key)
				if (!existing || desc.distSq < existing.distSq) desired.set(desc.key, desc)
			}
		})

		const chunks = chunksRef.current
		const pending = pendingRef.current
		let changed = false

		// Unload chunks that left their ring, cancel obsolete requests
		for (const [key, chunk] of chunks) {
			if (!desired.has(key)) {
				disposeChunk(chunk)
				chunks.delete(key)
				changed = true
			}
		}
		for (const [key, handle] of pending) {
			if (!desired.has(key)) {
				handle.cancel()
				pending.delete(key)
			}
		}

		// Request missing chunks, nearest first (pool sorts by priority)
		const pool = getTerrainWorkerPool()
		for (const [key, desc] of desired) {
			if (chunks.has(key) || pending.has(key)) continue

			const handle = pool.run('veg', { typeIndex: desc.typeIndex, chunkX: desc.chunkX, chunkZ: desc.chunkZ, chunkSize: desc.chunkSize }, desc.distSq)
			pending.set(key, handle)

			handle.promise.then((result) => {
				if (pendingRef.current.get(key) !== handle) return // cancelled/superseded
				pendingRef.current.delete(key)
				if (!result) return

				const chunk = { desc, meshes: null, count: result.count, colliderData: null }
				if (result.count > 0) {
					const model = vegetationModels[desc.typeIndex]
					const parts = model?.lods?.[desc.lodKey] ?? model?.lods?.[0]
					if (parts?.length) {
						const instanceMatrix = new InstancedBufferAttribute(result.matrices, 16)
						const boundsRadius = Math.hypot(desc.chunkSize / 2, desc.chunkSize / 2) + (result.maxY - result.minY) / 2 + BOUNDS_PADDING
						const bounds = new Sphere(new Vector3(desc.chunkX, (result.minY + result.maxY) / 2, desc.chunkZ), boundsRadius)

						chunk.meshes = parts.map((part) => {
							const mesh = new InstancedMesh(part.geometry, part.material, result.count)
							mesh.instanceMatrix = instanceMatrix
							mesh.boundingSphere = bounds
							mesh.castShadow = desc.castShadow
							mesh.receiveShadow = true
							mesh.matrixAutoUpdate = false
							return mesh
						})
						chunk.colliderData = result.colliders
					}
				}
				chunksRef.current.set(key, chunk)
				if (chunk.colliderData && colliderInReach(desc, vehicleState.position.x, vehicleState.position.z)) {
					eligibleCollidersRef.current.add(key)
				}
				bump()
			})
		}

		// Collider eligibility follows the vehicle even when no chunks changed
		const eligible = new Set()
		for (const [key, chunk] of chunks) {
			if (chunk.colliderData && colliderInReach(chunk.desc, vehX, vehZ)) eligible.add(key)
		}
		const prevEligible = eligibleCollidersRef.current
		if (eligible.size !== prevEligible.size || [...eligible].some((key) => !prevEligible.has(key))) {
			eligibleCollidersRef.current = eligible
			changed = true
		}

		if (changed) bump()
	})

	if (!showVegetation) return null

	const meshElements = []
	const colliderElements = []
	for (const [key, chunk] of chunksRef.current) {
		if (chunk.meshes) {
			chunk.meshes.forEach((mesh, partIndex) => {
				meshElements.push(<primitive key={`${key}-${partIndex}`} object={mesh} />)
			})
		}

		if (chunk.colliderData && eligibleCollidersRef.current.has(key)) {
			const { desc } = chunk
			const collider = VEGETATION_CONFIG[desc.typeIndex].collider
			const data = chunk.colliderData
			for (let i = 0; i < chunk.count; i++) {
				const base = i * 4
				const scale = data[base + 3]
				const scaledWidth = collider.width * scale
				const scaledHeight = collider.height * scale
				// Cylinder position is its center — lift by half height so the
				// collider bottom sits at the terrain surface.
				colliderElements.push(
					<RigidBody
						key={`${key}-col-${i}`}
						type='fixed'
						position={[data[base], data[base + 1] + scaledHeight / 2, data[base + 2]]}
						colliders={false}
					>
						{collider.type === 'cylinder' && <CylinderCollider args={[scaledHeight / 2, scaledWidth]} />}
					</RigidBody>
				)
			}
		}
	}

	return (
		<group name='Vegetation'>
			{meshElements}
			{colliderElements}
		</group>
	)
}

export default VegetationSystem
