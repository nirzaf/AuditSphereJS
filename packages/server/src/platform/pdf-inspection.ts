import { Worker } from 'node:worker_threads';
import { ServiceUnavailableException } from '@nestjs/common';

export class PdfPolicyRejectedError extends Error {
  constructor() {
    super('The PDF contains encrypted or active content, or could not be safely inspected.');
    this.name = 'PdfPolicyRejectedError';
  }
}

const INSPECTION_TIMEOUT_MS = 5_000;

type InspectionResult = { safe: true } | { safe: false };

/** Parse untrusted PDF bytes away from the API event loop with a memory and time bound. */
export async function inspectPdfFile(filePath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const worker = new Worker(new URL('./pdf-inspection-worker.js', import.meta.url), {
      workerData: { filePath },
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
    });
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      void worker.terminate();
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(() => finish(new ServiceUnavailableException('PDF security inspection exceeded its time limit; the file was not stored.')), INSPECTION_TIMEOUT_MS);
    worker.once('message', (result: InspectionResult) => {
      if (result?.safe === true) finish();
      else finish(new PdfPolicyRejectedError());
    });
    worker.once('error', () => finish(new ServiceUnavailableException('PDF security inspection is unavailable; the file was not stored.')));
    worker.once('exit', code => {
      if (!settled && code !== 0) finish(new ServiceUnavailableException('PDF security inspection stopped unexpectedly; the file was not stored.'));
      else if (!settled) finish(new PdfPolicyRejectedError());
    });
  });
}
