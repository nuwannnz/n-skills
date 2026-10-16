import { useEffect } from 'react';
import { editProject, useApp } from '../../app/store';
import { api } from '../../lib/api';

/** Who last changed a file (from `git log`), fetched once per file and kept with the project. */
export function useFileLog(root: string, path: string) {
  const log = useApp(s => s.projects[root]?.fileLogs[path]);
  useEffect(() => {
    if (log !== undefined) return;
    api.git.fileLog(root, path).then(l => editProject(root, p => { p.fileLogs[path] = l; }));
  }, [root, path, log]);
  return log ?? null;
}
