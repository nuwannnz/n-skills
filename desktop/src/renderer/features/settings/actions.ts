import { setApp } from '../../app/store';
import { api } from '../../lib/api';
import type { Permissions } from '../../lib/types';

/** Changes how much the agent may do without asking, for every project. The main process saves it and applies it from the agent's next step. */
export function setPermissions(mode: Permissions) {
  setApp(s => { s.permissions = mode; });
  api.setPermissions(mode);
}
