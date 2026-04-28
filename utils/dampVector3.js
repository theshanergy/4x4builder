import { MathUtils } from 'three'


// Helper to damp all components of a Vector3
export const dampVector3 = (current, target, lambda, delta) => {
	current.x = MathUtils.damp(current.x, target.x, lambda, delta)
	current.y = MathUtils.damp(current.y, target.y, lambda, delta)
	current.z = MathUtils.damp(current.z, target.z, lambda, delta)
}
