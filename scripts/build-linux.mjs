import { spawnSync } from 'node:child_process';
import { sourceFingerprint } from './source-fingerprint.mjs';
const result = spawnSync('docker', ['build', '--label', `org.auditsphere.source=${sourceFingerprint()}`, '-t', 'auditsphere-local:compatibility', '.'], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
