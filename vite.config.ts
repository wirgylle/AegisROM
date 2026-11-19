import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {defineConfig} from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dev: `npm run dev:api` поднимает Go-сервер (cmd/aegis-server), Vite проксирует к нему /api.
// Go API защищён токеном; сервер пишет его в .aegis-data/native-api.token, прокси подставляет его в запросы.
const DEV_PORT = 3000;
const API_TARGET = process.env.AEGIS_API_URL || 'http://127.0.0.1:38471';
const API_TOKEN_FILE = path.resolve(__dirname, process.env.AEGIS_DATA_DIR || '.aegis-data', 'native-api.token');
const DEV_ORIGIN_RE = new RegExp(`^http://(localhost|127\\.0\\.0\\.1):${DEV_PORT}$`, 'i');

function readApiToken(): string {
  try {
    return fs.readFileSync(API_TOKEN_FILE, 'utf-8').trim();
  } catch {
    return '';
  }
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: DEV_PORT,
      strictPort: true,
      proxy: {
        '/api': {
          target: API_TARGET,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              // Прокси не должен открывать Go API чужим сайтам: пропускаем только запросы со страницы dev-сервера.
              const origin = req.headers.origin;
              if (origin && !DEV_ORIGIN_RE.test(origin)) {
                res.writeHead(403, {'Content-Type': 'text/plain'});
                res.end('Forbidden origin');
                proxyReq.destroy();
                return;
              }
              proxyReq.removeHeader('origin');
              const token = readApiToken();
              if (token) proxyReq.setHeader('X-Aegis-Token', token);
            });
          },
        },
      },
    },
  };
});
