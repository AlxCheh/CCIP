// CommonJS runtime entry for @ccip/database.
// Compiled consumers (apps/api dist, CJS) require this instead of src/index.ts,
// which Node 24 would otherwise load as ESM and fail on the './generated/client'
// directory import (ERR_UNSUPPORTED_DIR_IMPORT).
// Types still resolve via package.json "types": "./src/index.ts"; jest bypasses
// this file entirely via moduleNameMapper -> packages/database/src.
module.exports = require('./src/generated/client');
