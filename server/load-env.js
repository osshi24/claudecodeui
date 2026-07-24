// Load environment variables from .env before other imports execute.
import fs from 'fs';
import os from 'os';
import path from 'path';

import { findAppRoot, getModuleDir } from './utils/runtime-paths.js';

const __dirname = getModuleDir(import.meta.url);
// Resolve the repo/app root via the nearest /server folder so this file keeps finding the
// same top-level .env file from both /server/load-env.js and /dist-server/server/load-env.js.
const APP_ROOT = findAppRoot(__dirname);

try {
  const envPath = path.join(APP_ROOT, '.env');
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      if (key && valueParts.length > 0 && !process.env[key]) {
        process.env[key] = valueParts.join('=').trim();
      }
    }
  });
} catch (e) {
  console.error('No .env file found or error reading it:', e.message);
}

// GUI-launched processes (desktop app, launchd/login items) get a minimal PATH that
// hides CLI install dirs like /opt/homebrew/bin, so spawned shells and plugin servers
// fail to find `claude` even though the user's terminal resolves it fine. Append the
// well-known install locations that exist on this machine but are missing from PATH.
const EXTRA_BIN_DIRS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  path.join(os.homedir(), '.local', 'bin'),
  path.join(os.homedir(), '.npm-global', 'bin'),
];

if (process.platform !== 'win32') {
  const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const missingDirs = EXTRA_BIN_DIRS.filter(
    dir => !pathEntries.includes(dir) && fs.existsSync(dir)
  );
  if (missingDirs.length > 0) {
    process.env.PATH = [...pathEntries, ...missingDirs].join(path.delimiter);
  }
}

// Keep the default database in a stable user-level location so rebuilding dist-server
// never changes where the backend stores auth.db when DATABASE_PATH is not set explicitly.
const DEFAULT_DATABASE_PATH = path.join(os.homedir(), '.cloudcli', 'auth.db');

if (!process.env.DATABASE_PATH) {
  process.env.DATABASE_PATH = DEFAULT_DATABASE_PATH;
}
