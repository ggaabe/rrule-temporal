import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import libraryPackage from './node_modules/rrule-temporal/package.json' with {type: 'json'};

// https://vite.dev/config/
export default defineConfig({
  base: '/rrule-temporal/',
  plugins: [react(), tailwindcss()],
  define: {
    // The installed library version, shown in the header.
    __RRULE_TEMPORAL_VERSION__: JSON.stringify(libraryPackage.version),
  },
  server: {
    open: true,
  },
});
