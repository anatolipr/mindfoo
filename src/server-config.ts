// Picks the folderfoo backend host based on where this page is being
// served from. Matches htmlpaint.com's host-detection pattern
// (src/backend/server.js): any hostname containing "local" (localhost,
// local.foo.com, etc) is treated as a dev environment.
const isLocal = window.location.hostname.indexOf('local') > -1;

export const FOLDERFOO_HOST = isLocal
  ? 'http://localhost:3000'
  : 'https://files.cuul.cc';

// Identifies this app to folderfoo (X-Tenant-Id) so its users.txt/.data
// stay isolated from other consuming apps. Single source of truth - every
// call site (createDocumentSlot, the profile-circle widget) reads this
// instead of each declaring its own copy.
export const TENANT_ID = 'mfoo';
