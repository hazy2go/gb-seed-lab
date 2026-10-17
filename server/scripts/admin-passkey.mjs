// One-time setup code for the admin page (run on the Mac mini, in server/): registers a passkey without being signed
// in. Use it for the first passkey, or to recover when every passkey is lost. Valid 15 minutes, single use; only its
// sha256 is stored (DATA_DIR/admin-setup.json). Anyone who can run this already has the machine, so it adds no new door.
//   node scripts/admin-passkey.mjs            print a new code
//   node scripts/admin-passkey.mjs --list     list registered passkeys
import path from 'node:path';
import { config } from '../src/config.mjs';
import { issueSetupCode, openPasskeys } from '../src/admin/passkeys.mjs';

if (process.argv.includes('--list')) {
  for (const c of openPasskeys(config.dataDir).all()) console.log(`${c.name}\t${c.email}\tcreated ${c.createdAt}\tlast used ${c.lastUsedAt || 'never'}\t${c.id.slice(0, 12)}…`);
  process.exit(0);
}
const { code, expires } = issueSetupCode(config.dataDir);
console.log(`Setup code: ${code}`);
console.log(`Valid until ${new Date(expires).toLocaleString()} (15 min), once.`);
console.log(config.adminHost ? `Open https://${config.adminHost}${config.adminPath}/ , sign in through Cloudflare Access, enter the code and create the passkey.` : 'ADMIN_HOST is not set in server/.env: the admin page is off.');
console.log(`(stored as a hash in ${path.join(config.dataDir, 'admin-setup.json')})`);
