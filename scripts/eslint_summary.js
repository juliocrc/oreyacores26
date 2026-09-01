const fs = require('fs');
const path = require('path');
const jsonPath = path.resolve(process.cwd(), 'eslint-remaining.json');
const outPath = path.resolve(process.cwd(), 'eslint-remaining-summary.txt');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
let totalErrors = 0, totalWarnings = 0;
const ruleCount = {};
const fileCounts = {};
for (const f of data) {
  totalErrors += f.errorCount || 0;
  totalWarnings += f.warningCount || 0;
  fileCounts[f.filePath] = (fileCounts[f.filePath] || 0) + ((f.errorCount||0) + (f.warningCount||0));
  for (const m of f.messages) {
    const r = m.ruleId || '(no-rule)';
    ruleCount[r] = (ruleCount[r] || 0) + 1;
  }
}
const topFiles = Object.entries(fileCounts).sort((a,b)=>b[1]-a[1]).slice(0,50);
const topRules = Object.entries(ruleCount).sort((a,b)=>b[1]-a[1]).slice(0,50);
const lines = [];
lines.push('ESLint remaining problems summary');
lines.push('================================');
lines.push(`Total files reported: ${data.length}`);
lines.push(`Total errors: ${totalErrors}`);
lines.push(`Total warnings: ${totalWarnings}`);
lines.push('');
lines.push('Top files with most problems (count \t filepath):');
for (const [f,c] of topFiles) lines.push(`${c}\t${f}`);
lines.push('');
lines.push('Top rules (count \t ruleId):');
for (const [r,c] of topRules) lines.push(`${c}\t${r}`);
fs.writeFileSync(outPath, lines.join('\n'));
console.log('wrote', outPath);
