import 'reflect-metadata';
import 'dotenv/config';
import { runWorker } from '@auditsphere/server';
runWorker().catch(error => { console.error(error); process.exitCode = 1; });
