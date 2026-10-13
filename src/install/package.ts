import { readFileSync } from 'node:fs';

export interface PackageInfo {
  name: string;
  version: string;
}

export function packageInfo(): PackageInfo {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as PackageInfo;
  return { name: pkg.name, version: pkg.version };
}
