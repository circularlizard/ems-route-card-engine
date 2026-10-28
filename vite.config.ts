import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

function buildManifestPlugin() {
    return {
        name: 'ems-route-build-manifest',
        closeBundle() {
            const manifest = { built_at: new Date().toISOString() };
            mkdirSync( resolve( __dirname, 'assets' ), { recursive: true } );
            writeFileSync(
                resolve( __dirname, 'assets/build-manifest.json' ),
                JSON.stringify( manifest, null, 2 )
            );
        },
    };
}

export default defineConfig({
    plugins: [react(), buildManifestPlugin()],
    build: {
        outDir: 'assets/js',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                'route-card-studio': resolve( __dirname, 'resources/js/standalone/index.tsx' ),
            },
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: '[name].js',
                assetFileNames: '[name].[ext]',
                manualChunks: undefined,
            },
        },
    },
});
