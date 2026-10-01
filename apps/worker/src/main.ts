import 'reflect-metadata';
import 'dotenv/config';
process.env.SERVICE_NAME = 'auditsphere-worker';
const { runWorker } = await import('@auditsphere/server');
runWorker().catch(error => { console.error(error); process.exitCode = 1; });
