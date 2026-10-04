import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Put, Query, Req, SerializeOptions, StandardSchemaSerializerInterceptor, UseGuards, UseInterceptors, UsePipes, StandardSchemaValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiCreatedResponse, ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  apiProblemSchema, invoiceReceiptSchema, invoiceIssuedResultSchema, invoicePaymentResultSchema,
  invoiceReceiptResultSchema, invoiceViewSchema, invoicesSchema, issueInvoiceSchema, invoiceVoidResultSchema, voidInvoiceSchema, practiceAccountSchema,
  practiceAccountViewSchema, practiceJournalViewSchema, practiceLedgerSchema, practicePeriodTransitionResultSchema,
  practiceFirmTrialBalanceQuerySchema, practiceFirmTrialBalanceSchema, practiceFirmTrialBalanceDetailQuerySchema, practiceFirmTrialBalanceDetailSchema,
  practicePeriodViewSchema, practicePostingPolicyViewSchema,
  practiceJournalSchema, practicePeriodSchema, practicePeriodTransitionSchema,
  practicePostingPolicySchema, practiceReverseJournalSchema, practiceVersionSchema, practiceExpenseDraftSchema, practiceExpenseSettlementSchema,
  practiceExpenseReceiptViewSchema, practiceExpenseReceiptsSchema,
  recordPaymentSchema, paginationQuerySchema,
} from '@auditsphere/contracts';
import type { InvoiceReceiptRequest, PaginationQuery, PracticeFirmTrialBalanceQuery, PracticeFirmTrialBalanceDetailQuery } from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import { ReqActor } from '../../platform/request-actor.js';
import { approveFirmPostingPolicy, createPracticeAccount, createPracticePeriod, createPracticeJournal, createPracticeExpenseDraft, settlePracticeExpense, postPracticeJournal, reversePracticeJournal, closePracticePeriod, reopenPracticePeriod, practiceLedger } from './ledger.js';
import { issueInvoice, issueInvoiceReceipt, listInvoices, recordInvoicePayment, voidInvoice } from './invoices.js';
import { attachPracticeExpenseReceipt, listPracticeExpenseReceipts } from './expense-receipts.js';
import { firmTrialBalance, firmTrialBalanceAccount } from './trial-balance.js';
import type { UploadFilePart } from '../../platform/document-uploads.js';
import { toPracticeAccountView, toPracticeInvoiceView, toPracticeJournalView, toPracticeLedgerView, toPracticePeriodView } from './practice-response.js';

type MultipartRequest = { file: (options?: { limits?: { fileSize?: number; files?: number; fields?: number; parts?: number }; throwFileSizeLimit?: boolean }) => Promise<UploadFilePart | undefined> };

@ApiTags('Practice ledger') @ApiBearerAuth() @ApiDefaultResponse({ standardSchema: apiProblemSchema }) @UseGuards(InternalGuard) @UsePipes(new StandardSchemaValidationPipe()) @UseInterceptors(StandardSchemaSerializerInterceptor)
@Controller('engagements/:engagementId/practice')
export class PracticeLedgerController {
  @Get('reports/trial-balance')
  @ApiOkResponse({ standardSchema: practiceFirmTrialBalanceSchema })
  @SerializeOptions({ schema: practiceFirmTrialBalanceSchema })
  trialBalance(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Query({ schema: practiceFirmTrialBalanceQuerySchema }) query: PracticeFirmTrialBalanceQuery) {
    return firmTrialBalance(actorId, engagementId, query);
  }

  @Get('reports/trial-balance/accounts/:accountId')
  @ApiOkResponse({ standardSchema: practiceFirmTrialBalanceDetailSchema })
  @SerializeOptions({ schema: practiceFirmTrialBalanceDetailSchema })
  trialBalanceAccount(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('accountId') accountId: string, @Query({ schema: practiceFirmTrialBalanceDetailQuerySchema }) query: PracticeFirmTrialBalanceDetailQuery) {
    return firmTrialBalanceAccount(actorId, engagementId, accountId, query);
  }

  @Get('expenses/:journalId/receipts')
  @ApiOkResponse({ standardSchema: practiceExpenseReceiptViewSchema, isArray: true })
  @SerializeOptions({ schema: practiceExpenseReceiptViewSchema })
  receipts(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('journalId') journalId: string) {
    return listPracticeExpenseReceipts(actorId, engagementId, journalId);
  }

  @Put('expenses/:journalId/receipts')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiCreatedResponse({ standardSchema: practiceExpenseReceiptViewSchema })
  @SerializeOptions({ schema: practiceExpenseReceiptViewSchema })
  async attachReceipt(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('journalId') journalId: string, @Headers('idempotency-key') idempotencyKey: string | undefined, @Req() request: MultipartRequest) {
    const part = await request.file({ limits: { fileSize: 15_000_000, files: 1, fields: 0, parts: 1 }, throwFileSizeLimit: false });
    if (!part) throw new BadRequestException('A single receipt file part is required.');
    return attachPracticeExpenseReceipt(actorId, engagementId, journalId, idempotencyKey ?? '', part);
  }

  @Get()
  @ApiOkResponse({ standardSchema: practiceLedgerSchema })
  @SerializeOptions({ schema: practiceLedgerSchema })
  async read(@ReqActor() actorId: string, @Param('engagementId') engagementId: string) { return toPracticeLedgerView(await practiceLedger(actorId, engagementId)); }

  @Post('posting-policy')
  @ApiCreatedResponse({ standardSchema: practicePostingPolicyViewSchema })
  @SerializeOptions({ schema: practicePostingPolicyViewSchema })
  async policy(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body({ schema: practicePostingPolicySchema }) body: unknown) {
    const result = await approveFirmPostingPolicy(actorId, engagementId, body);
    return { policyVersion: result.policyVersion, revenueTreatment: result.revenueTreatment, taxTreatment: result.taxTreatment, approvedAt: result.approvedAt instanceof Date ? result.approvedAt.toISOString() : new Date(result.approvedAt).toISOString() };
  }

  @Post('accounts')
  @ApiCreatedResponse({ standardSchema: practiceAccountViewSchema })
  @SerializeOptions({ schema: practiceAccountViewSchema })
  async account(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body({ schema: practiceAccountSchema }) body: unknown) { return toPracticeAccountView(await createPracticeAccount(actorId, engagementId, body)); }

  @Post('periods')
  @ApiCreatedResponse({ standardSchema: practicePeriodViewSchema })
  @SerializeOptions({ schema: practicePeriodViewSchema })
  async period(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body({ schema: practicePeriodSchema }) body: unknown) { return toPracticePeriodView(await createPracticePeriod(actorId, engagementId, body)); }

  @Post('journals')
  @ApiCreatedResponse({ standardSchema: practiceJournalViewSchema })
  @SerializeOptions({ schema: practiceJournalViewSchema })
  async journal(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body({ schema: practiceJournalSchema }) body: unknown) { return toPracticeJournalView(await createPracticeJournal(actorId, engagementId, body)); }

  @Post('expenses/drafts')
  @ApiCreatedResponse({ standardSchema: practiceJournalViewSchema })
  @SerializeOptions({ schema: practiceJournalViewSchema })
  async expenseDraft(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body({ schema: practiceExpenseDraftSchema }) body: unknown) { return toPracticeJournalView(await createPracticeExpenseDraft(actorId, engagementId, body)); }

  @Post('expenses/:id/settlements')
  @ApiCreatedResponse({ standardSchema: practiceJournalViewSchema })
  @SerializeOptions({ schema: practiceJournalViewSchema })
  async settleExpense(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('id') expenseJournalId: string, @Body({ schema: practiceExpenseSettlementSchema }) body: unknown) {
    return toPracticeJournalView(await settlePracticeExpense(actorId, engagementId, expenseJournalId, body));
  }

  @Post('journals/:id/post')
  @ApiCreatedResponse({ standardSchema: practiceJournalViewSchema })
  @SerializeOptions({ schema: practiceJournalViewSchema })
  async post(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('id') id: string, @Body({ schema: practiceVersionSchema }) body: unknown) { return toPracticeJournalView(await postPracticeJournal(actorId, engagementId, id, body)); }

  @Post('journals/:id/reverse')
  @ApiCreatedResponse({ standardSchema: practiceJournalViewSchema })
  @SerializeOptions({ schema: practiceJournalViewSchema })
  async reverse(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('id') id: string, @Body({ schema: practiceReverseJournalSchema }) body: unknown) { return toPracticeJournalView(await reversePracticeJournal(actorId, engagementId, id, body)); }

  @Post('periods/:id/close')
  @ApiCreatedResponse({ standardSchema: practicePeriodTransitionResultSchema })
  @SerializeOptions({ schema: practicePeriodTransitionResultSchema })
  close(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('id') id: string, @Body({ schema: practicePeriodTransitionSchema }) body: unknown) { return closePracticePeriod(actorId, engagementId, id, body); }

  @Post('periods/:id/reopen')
  @ApiCreatedResponse({ standardSchema: practicePeriodTransitionResultSchema })
  @SerializeOptions({ schema: practicePeriodTransitionResultSchema })
  reopen(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('id') id: string, @Body({ schema: practicePeriodTransitionSchema }) body: unknown) { return reopenPracticePeriod(actorId, engagementId, id, body); }

  @Get('invoices')
  @ApiOkResponse({ standardSchema: invoiceViewSchema, isArray: true })
  @SerializeOptions({ schema: invoiceViewSchema })
  async invoices(@Param('engagementId') engagementId: string, @Query({ schema: paginationQuerySchema }) page: PaginationQuery) { return (await listInvoices(engagementId, page)).map(toPracticeInvoiceView); }

  @Post('invoices')
  @ApiCreatedResponse({ standardSchema: invoiceIssuedResultSchema })
  @SerializeOptions({ schema: invoiceIssuedResultSchema })
  issue(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Body({ schema: issueInvoiceSchema }) body: unknown) { return issueInvoice(actorId, engagementId, body); }

  @Post('invoices/:id/payment')
  @ApiCreatedResponse({ standardSchema: invoicePaymentResultSchema })
  @SerializeOptions({ schema: invoicePaymentResultSchema })
  payment(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('id') id: string, @Body({ schema: recordPaymentSchema }) body: unknown) { return recordInvoicePayment(actorId, engagementId, id, body); }

  @Post('invoices/:id/receipt')
  @ApiCreatedResponse({ standardSchema: invoiceReceiptResultSchema })
  @SerializeOptions({ schema: invoiceReceiptResultSchema })
  receipt(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('id') id: string, @Body({ schema: invoiceReceiptSchema }) body: InvoiceReceiptRequest) { return issueInvoiceReceipt(actorId, engagementId, id, body.idempotencyKey); }

  @Post('invoices/:id/void')
  @ApiCreatedResponse({ standardSchema: invoiceVoidResultSchema })
  @SerializeOptions({ schema: invoiceVoidResultSchema })
  void(@ReqActor() actorId: string, @Param('engagementId') engagementId: string, @Param('id') id: string, @Body({ schema: voidInvoiceSchema }) body: unknown) { return voidInvoice(actorId, engagementId, id, body); }
}
