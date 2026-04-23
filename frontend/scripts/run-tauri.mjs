import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';

const cargoBin = path.join(os.homedir(), '.cargo', 'bin');
const sep = path.delimiter;
const parts = (process.env.PATH || '').split(sep).filter(Boolean);
if (!parts.some((p) => path.normalize(p) === path.normalize(cargoBin))) {
  process.env.PATH = `${cargoBin}${sep}${process.env.PATH || ''}`;
}

const tauriArgs = process.argv.slice(2);
const result = spawnSync('npx', ['tauri', ...tauriArgs], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});
process.exit(result.status === null ? 1 : result.status);
