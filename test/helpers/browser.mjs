import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

/**
 * Finds a Chromium to drive.
 *
 * Playwright normally resolves its own download, but CI images often ship a
 * browser whose build number doesn't match the installed Playwright package.
 * Rather than re-downloading one, fall back to whatever is already on disk.
 */
function resolveExecutable() {
  if (process.env.CHROMIUM_PATH) {
    return process.env.CHROMIUM_PATH;
  }

  try {
    const own = chromium.executablePath();
    if (own && fs.existsSync(own)) {
      return undefined; // Playwright's own copy is present; let it decide.
    }
  } catch {
    /* Not installed via Playwright. Fall through to the search below. */
  }

  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!fs.existsSync(root)) {
    return undefined;
  }

  const candidates = fs.readdirSync(root)
    .filter(name => name.startsWith('chromium-'))
    .map(name => path.join(root, name, 'chrome-linux', 'chrome'))
    .filter(file => fs.existsSync(file));

  return candidates[0];
}

export function launchBrowser() {
  const executablePath = resolveExecutable();
  return chromium.launch(executablePath ? { executablePath } : {});
}
