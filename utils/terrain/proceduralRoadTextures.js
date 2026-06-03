import { CanvasTexture } from 'three'

const clamp = (value, min, max) => (value < min ? min : value > max ? max : value)
const clamp255 = (value) => clamp(Math.round(value), 0, 255)

const drawFlatNormal = (ctx, size) => {
	const image = ctx.createImageData(size, size)

	for (let i = 0; i < image.data.length; i += 4) {
		image.data[i] = 128
		image.data[i + 1] = 128
		image.data[i + 2] = 255
		image.data[i + 3] = 255
	}

	ctx.putImageData(image, 0, 0)
}

const drawDirtSwatch = (ctx, size, color = [106, 86, 61]) => {
	const image = ctx.createImageData(size, size)

	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const i = (y * size + x) * 4

			image.data[i] = clamp255(color[0])
			image.data[i + 1] = clamp255(color[1])
			image.data[i + 2] = clamp255(color[2])
			image.data[i + 3] = 255
		}
	}

	ctx.putImageData(image, 0, 0)
}

export const createProceduralRoadTexture = (definition = {}) => {
	if (typeof document === 'undefined') return null

	const size = definition.size ?? 64
	const canvas = document.createElement('canvas')
	canvas.width = size
	canvas.height = size
	const ctx = canvas.getContext('2d')

	if (definition.kind === 'dirtDoubleTrackNormal') {
		drawFlatNormal(ctx, size)
	} else {
		drawDirtSwatch(ctx, size, definition.color)
	}

	const texture = new CanvasTexture(canvas)
	texture.needsUpdate = true
	return texture
}
