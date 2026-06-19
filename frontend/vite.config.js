import { defineConfig } from 'vite';

export default defineConfig({
  // Directorio de archivos estáticos
  publicDir: 'public',

  // Configuración del servidor de desarrollo
  server: {
    port: 3000,
    open: true,
    proxy: {
      // Proxy local: /api/mef/datastore_search → https://api.datosabiertos.mef.gob.pe/DatosAbiertos/v1/datastore_search
      '/api/mef': {
        target: 'https://api.datosabiertos.mef.gob.pe',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/mef/, '/DatosAbiertos/v1'),
      },
    },
  },

  // Configuración del build de producción
  build: {
    outDir: 'dist',
    sourcemap: true,
  },

  // Configuración de Vitest
  test: {
    globals: true,
    environment: 'node',
  },
});
