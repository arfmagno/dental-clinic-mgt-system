import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

/** Single-container hosting: serves the built web app with an SPA fallback, if webDir holds a build. */
export async function serveWebApp(app: FastifyInstance, webDirSetting: string | undefined) {
  const webDir = webDirSetting ? path.resolve(webDirSetting) : '';
  if (!webDir || !fs.existsSync(path.join(webDir, 'index.html'))) return;
  await app.register(fastifyStatic, {
    root: webDir,
    setHeaders(res, filePath) {
      // The shell and service worker must revalidate so updates reach installed apps; hashed assets are immutable.
      const base = path.basename(filePath);
      if (base === 'index.html' || base === 'sw.js' || base === 'manifest.webmanifest' || base.startsWith('workbox-')) {
        res.header('cache-control', 'no-cache');
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.header('cache-control', 'public, max-age=31536000, immutable');
      }
    },
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html'); // SPA fallback
    return reply.code(404).send({ error: 'not found' });
  });
}
