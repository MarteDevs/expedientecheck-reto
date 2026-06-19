import { defineConfig } from 'vite';

export default defineConfig({
  // Directorio de archivos estáticos
  publicDir: 'public',

  // Configuración del servidor de desarrollo
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/DatosAbiertos': {
        target: 'https://api.datosabiertos.mef.gob.pe',
        changeOrigin: true,
        secure: false,
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
