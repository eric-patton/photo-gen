import { execFile } from 'node:child_process';
import { buildApp } from './app';
import { getDb } from './db/db';
import { LIBRARY_ROOT, PORT } from './config';

const serveStatic = process.argv.includes('--serve-static');
const openBrowser = process.argv.includes('--open');

getDb(); // opens the library DB and applies pending migrations

const app = await buildApp({ serveStatic });
await app.listen({ port: PORT, host: '127.0.0.1' });

app.log.info(`library root: ${LIBRARY_ROOT}`);
app.log.info(`photo-gen ready at http://localhost:${PORT}`);

if (openBrowser && process.platform === 'win32') {
  execFile('cmd.exe', ['/c', 'start', '', `http://localhost:${PORT}`]);
}
