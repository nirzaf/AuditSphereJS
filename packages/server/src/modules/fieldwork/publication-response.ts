/** Transport mapping shared by publication controllers and contract tests. */
type DecimalValue = string | { toFixed(scale: number): string };
type PublicationRecord = {
  id: string; sequence: number; currency: string; rowCount: number; digest: string; publishedAt: Date;
  rows?: Array<{ id: string; position: number; code: string; name: string; fsli: string; current: DecimalValue; prior: DecimalValue }>;
};

const moneyText = (value: DecimalValue) => typeof value === 'string' ? value : value.toFixed(6);

export function toPublicationView(publication: PublicationRecord) {
  return {
    id: publication.id, sequence: publication.sequence, currency: publication.currency,
    rowCount: publication.rowCount, digest: publication.digest, publishedAt: publication.publishedAt.toISOString(),
  };
}

export function toPublicationDetailView(publication: PublicationRecord) {
  return {
    ...toPublicationView(publication),
    rows: (publication.rows ?? []).map((row) => ({
      id: row.id, position: row.position, code: row.code, name: row.name, fsli: row.fsli,
      current: moneyText(row.current), prior: moneyText(row.prior),
    })),
  };
}
