// Runs the app with the renderer served by Vite, so edits under src/renderer show up
// without a rebuild (React components update in place). Changes to the main process
// (src/*.js) still need a restart.
//   npm run dev -w desktop        (extra arguments go to the app, for example a project folder)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ configFile: join(root, 'vite.config.ts'), root: join(root, 'src/renderer') });
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`renderer: ${url}`);

const electron = createRequire(import.meta.url)('electron');
const app = spawn(electron, [root, ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, SCRUMO_RENDERER_URL: url } });
app.on('exit', code => { server.close(); process.exit(code ?? 0); });
