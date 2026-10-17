import { readFileSync, writeFileSync } from 'node:fs';

// Fix auth.mjs
let auth = readFileSync('tests/auth.mjs', 'utf8');
auth = auth.replace(
  "\"'../../../lib/auth-validation'\",\"'./validation.mjs'\")",
  "\"'../../../lib/auth-validation'\",\"'\"+pathToFileURL(join(dir,'validation.mjs')).href+\"'\")"
);
auth = auth.replace(
  "const {POST}=await import(join(dir,'route.mjs'));",
  "const {POST}=await import(pathToFileURL(join(dir,'route.mjs')).href);"
);
writeFileSync('tests/auth.mjs', auth);
console.log('auth.mjs patched');

// Fix admin.mjs
let admin = readFileSync('tests/admin.mjs', 'utf8');
// Add pathToFileURL import
if (!admin.includes('pathToFileURL')) {
  admin = admin.replace(
    "import {join} from 'node:path';",
    "import {join} from 'node:path';\nimport {pathToFileURL} from 'node:url';"
  );
}
// Fix all join(dir, ...) in import() calls
admin = admin.replace(
  /await import\(join\(dir,'([^']+)'\)\)/g,
  "await import(pathToFileURL(join(dir,'$1')).href)"
);
writeFileSync('tests/admin.mjs', admin);
console.log('admin.mjs patched');

// Fix admin-actions.mjs
let actions = readFileSync('tests/admin-actions.mjs', 'utf8');
if (!actions.includes('pathToFileURL')) {
  actions = actions.replace(
    "import {join} from 'node:path';",
    "import {join} from 'node:path';\nimport {pathToFileURL} from 'node:url';"
  );
}
actions = actions.replace(
  /await import\(join\(dir,'([^']+)'\)\)/g,
  "await import(pathToFileURL(join(dir,'$1')).href)"
);
writeFileSync('tests/admin-actions.mjs', actions);
console.log('admin-actions.mjs patched');

console.log('All test files patched for Windows ESM compatibility.');
