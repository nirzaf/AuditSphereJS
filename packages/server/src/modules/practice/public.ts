import type { Prisma } from '../../generated/prisma/client.js';
import { db } from '../../platform/db.js';
import { Decimal6 } from '../../platform/decimal6.js';

type PracticeReadClient = typeof db | Prisma.TransactionClient;

export type AdvanceInvoiceEvidence = {
  invoiceId: string;
  amount: string;
  paidToDate: string;
  receiptId: string | null;
};

/** Practice-owned advance invoice evidence for the Governance portal-activation gate. */
export async function advanceInvoiceEvidence(client: PracticeReadClient, engagementId: string): Promise<AdvanceInvoiceEvidence | null> {
  const invoice = await client.engagementInvoice.findFirst({
    where: { engagementId, kind: 'ADVANCE_50', status: { not: 'VOID' } },
    orderBy: { number: 'asc' },
    select: { id: true, amount: true, payments: { select: { amount: true } }, receipt: { select: { id: true } } },
  });
  if (!invoice) return null;
  return {
    invoiceId: invoice.id,
    amount: Decimal6.from(invoice.amount.toString()).toFixed(2),
    paidToDate: Decimal6.sum(invoice.payments.map(payment => Decimal6.from(payment.amount.toString()))).toFixed(2),
    receiptId: invoice.receipt?.id ?? null,
  };
}

export type FinalInvoiceEvidence = { invoiceId: string; number: number; status: string };

/** Practice-owned final invoice evidence for the Reporting release gate. */
export async function finalInvoiceEvidence(client: PracticeReadClient, engagementId: string): Promise<FinalInvoiceEvidence | null> {
  const invoice = await client.engagementInvoice.findFirst({
    where: { engagementId, kind: 'FINAL_50', status: { not: 'VOID' } },
    orderBy: { number: 'asc' },
    select: { id: true, number: true, status: true },
  });
  return invoice ? { invoiceId: invoice.id, number: invoice.number, status: invoice.status } : null;
}
