// Runs after `npm install -g scrumo-desktop` (and after electron's own
// postinstall has downloaded the binary). Adds the app launcher. Never fails
// the install: if anything goes wrong, `scrumo-desktop --install-launcher`
// retries, and the app re-creates the launcher on its next start.
import { ensureElectron, installLauncher, isGlobalInstall } from '../src/launcher.js';

if (process.env.npm_config_global !== 'true' || !isGlobalInstall() || process.env.CI || process.env.SCRUMO_DESKTOP_NO_LAUNCHER) {
  process.exit(0);
}
try {
  ensureElectron();
  const where = installLauncher();
  console.log(`Scrumo: added ${where}`);
} catch (err) {
  console.warn(`Scrumo: could not add the app launcher (${err.message}). Run "scrumo-desktop --install-launcher" to try again.`);
}
