// The product's name, read from spec/brand.yaml (see there for how to change it).
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export const brand = parse(readFileSync(new URL('../spec/brand.yaml', import.meta.url), 'utf8')) as { name: string; package: string };
