import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { handleApiRequest } from './server/index.js';

// Plugin de middleware backend para desarrollo en Vite
function apiBackendPlugin() {
  return {
    name: 'api-backend-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith('/api/')) {
          try {
            const handled = await handleApiRequest(req, res);
            if (handled) return;
          } catch (err) {
            console.error('[API Middleware Error]:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message }));
            return;
          }
        }
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), apiBackendPlugin()],
});
