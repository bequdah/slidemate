const fs = require('fs');
let s = fs.readFileSync('api/analyze.ts', 'utf8');
s = s.replace(/ don['\u2019]t copy\)\./g, '');
fs.writeFileSync('api/analyze.ts', s);
console.log('Done');
