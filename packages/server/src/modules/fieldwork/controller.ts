import { Controller, Get, Post, Patch, Body, Param, Query, Req, SerializeOptions, StandardSchemaSerializerInterceptor, StandardSchemaValidationPipe, UseGuards, UseInterceptors, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  apiProblemSchema, editLeaseResultSchema, editLeaseSchema, finalizeSchema, mappingSchema, mappingsSavedSchema,
  paginationQuerySchema, trialBalanceFinalizedSchema, trialBalanceImportSchema,
  trialBalanceRowsPageSchema, trialBalanceRowsQuerySchema, trialBalanceSummaryLineSchema, uploadSchema,
} from '@auditsphere/contracts';
import type { PaginationQuery, TrialBalanceRowsQuery } from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import * as service from './service.js';
import { db } from '../../platform/db.js';
import { editLease } from '../../platform/leases.js';

function importDto(batch: Awaited<ReturnType<typeof service.getBatch>>) {
  return {
    id: batch.id, status: batch.status, error: batch.error, rowCount: batch.rowCount,
    version: batch.version, createdAt: batch.createdAt.toISOString(),
  };
}
@ApiTags('Fieldwork') @ApiBearerAuth() @ApiDefaultResponse({ standardSchema: apiProblemSchema }) @UseGuards(InternalGuard) @UsePipes(new StandardSchemaValidationPipe()) @UseInterceptors(StandardSchemaSerializerInterceptor)
@Controller('engagements/:engagementId/imports')
export class FieldworkController {
  @Get()
  @ApiOkResponse({ standardSchema: trialBalanceImportSchema, isArray: true })
  @SerializeOptions({ schema: trialBalanceImportSchema })
  async list(@Param('engagementId') e: string, @Query({ schema: paginationQuerySchema }) query: PaginationQuery) { return (await db.tbImport.findMany({where:{engagementId:e},orderBy:{createdAt:'desc'},skip:query.offset,take:query.limit})).map(importDto); }

  @Post()
  @ApiCreatedResponse({ standardSchema: trialBalanceImportSchema })
  @SerializeOptions({ schema: trialBalanceImportSchema })
  async upload(@Param('engagementId') e: string, @Req() req: any, @Body({ schema: uploadSchema }) body: unknown) { return importDto(await service.upload(e, req.actorId, body)); }

  @Get(':id')
  @ApiOkResponse({ standardSchema: trialBalanceImportSchema })
  @SerializeOptions({ schema: trialBalanceImportSchema })
  async batch(@Param('engagementId') e: string, @Param('id') id: string) { return importDto(await service.getBatch(e, id)); }

  @Get(':id/rows')
  @ApiOkResponse({ standardSchema: trialBalanceRowsPageSchema })
  @SerializeOptions({ schema: trialBalanceRowsPageSchema })
  async rows(@Param('engagementId') e: string, @Param('id') id: string, @Query({ schema: trialBalanceRowsQuerySchema }) query: TrialBalanceRowsQuery) {
    const page = await service.rows(e, id, query.offset, query.search, query.limit);
    return {
      total: page.total,
      rows: page.rows.map(({ id: rowId, code, name, current, prior, fsli, version }) => ({
        id: rowId, code, name, current: current.toFixed(6), prior: prior.toFixed(6), fsli, version,
      })),
    };
  }

  @Patch(':id/mappings')
  @ApiOkResponse({ standardSchema: mappingsSavedSchema })
  @SerializeOptions({ schema: mappingsSavedSchema })
  map(@Param('engagementId') e: string, @Param('id') id: string, @Req() req: any, @Body({ schema: mappingSchema }) body: unknown) { return service.mapBatch(e, id, req.actorId, body); }

  @Post(':id/finalize')
  @ApiCreatedResponse({ standardSchema: trialBalanceFinalizedSchema })
  @SerializeOptions({ schema: trialBalanceFinalizedSchema })
  finalize(@Param('engagementId') e: string, @Param('id') id: string, @Req() req: any, @Body({ schema: finalizeSchema }) body: unknown) { return service.finalize(e, id, req.actorId, body); }

  @Get(':id/summary')
  @ApiOkResponse({ standardSchema: trialBalanceSummaryLineSchema, isArray: true })
  @SerializeOptions({ schema: trialBalanceSummaryLineSchema })
  summary(@Param('engagementId') e: string, @Param('id') id: string) { return service.aggregate(e, id); }

  @Post(':id/lease')
  @ApiCreatedResponse({ standardSchema: editLeaseResultSchema })
  @SerializeOptions({ schema: editLeaseResultSchema })
  async lease(@Param('engagementId') e: string, @Param('id') id: string, @Req() req: any, @Body({ schema: editLeaseSchema }) body: unknown) { await service.getBatch(e, id); return editLease(id, req.actorId, body); }
}
