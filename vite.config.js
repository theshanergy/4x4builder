import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'
import glsl from 'vite-plugin-glsl'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        svgr({
            include: '**/*.svg',
        }),
        glsl(),
        basicSsl(),
    ],
    server: {
        host: true,
        proxy: {
            // Forward /tiles/* to the local game server during development.
            // In production the client uses VITE_TILE_SERVER_URL directly.
            '/tiles': {
                target: 'http://localhost:8080',
                changeOrigin: true,
            },
        },
    },
    resolve: {
        dedupe: ['three', 'three-stdlib'],
    },
})
