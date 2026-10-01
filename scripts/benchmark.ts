import { parseTrialBalance } from '@auditsphere/server';
for (const count of [5000, 25000, 50000]) {
  const csv = 'code,name,current,prior\n' + Array.from({ length: count }, (_, i) => `${i},Account ${i},${i % 2 ? '-1.00' : '1.00'},0.00`).join('\n');
  const start = performance.now();
  const rows = parseTrialBalance(csv);
  console.log(JSON.stringify({ rows: rows.length, parseMs: Math.round(performance.now() - start), heapMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) }));
}
