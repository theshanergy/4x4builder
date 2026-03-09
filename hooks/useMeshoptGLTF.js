import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three-stdlib'
import { MeshoptDecoder } from 'meshoptimizer'

const configureMeshoptLoader = (loader) => {
	loader.setMeshoptDecoder(MeshoptDecoder)
}

export const preloadMeshoptGLTF = (path) => useLoader.preload(GLTFLoader, path, configureMeshoptLoader)

const useMeshoptGLTF = (path) => {
	return useLoader(GLTFLoader, path, configureMeshoptLoader)
}

export default useMeshoptGLTF