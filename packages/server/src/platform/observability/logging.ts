const sensitive = /password|passphrase|secret|token|authorization|cookie|credential|api[-_]?key|private[-_]?key|access[-_]?key|evidence|document.?body/i;

/** Fail-closed sanitizer for structured operational events; arbitrary error text is never copied. */
export function safeLogFields(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[REDACTED]';
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => safeLogFields(item, depth + 1));
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = sensitive.test(key) ? '[REDACTED]' : safeLogFields(item, depth + 1);
  }
  return output;
}

export function safeOperationalCode(error: unknown, fallback: string): string {
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' && /^[A-Z0-9_.:-]{1,120}$/.test(code) ? code : fallback;
}
