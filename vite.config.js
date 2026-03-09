import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'
import glsl from 'vite-plugin-glsl'
import seoPrerenderPlugin from './plugins/seoPrerenderPlugin.js'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        svgr({
            include: '**/*.svg',
        }),
        glsl(),
        seoPrerenderPlugin(),
    ],
    server: {
        host: true,
    },
    resolve: {
        dedupe: ['three', 'three-stdlib'],
    },
})
