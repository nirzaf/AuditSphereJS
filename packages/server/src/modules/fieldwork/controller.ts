import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiBody } from '@nestjs/swagger';
import { z } from 'zod';
import { uploadSchema, mappingSchema, finalizeSchema } from '@auditsphere/contracts';
import { InternalGuard } from '../../platform/auth.js';
import * as service from './service.js';
import { db } from '../../platform/db.js';
import { editLease } from '../../platform/leases.js';
@ApiTags('Fieldwork') @ApiBearerAuth() @UseGuards(InternalGuard)
@Controller('engagements/:engagementId/imports')
export class FieldworkController {
  @Get() list(@Param('engagementId') e: string) { return db.tbImport.findMany({where:{engagementId:e},orderBy:{createdAt:'desc'}}); }
  @Post() @ApiBody({ schema: z.toJSONSchema(uploadSchema) as any }) upload(@Param('engagementId') e: string, @Req() req: any, @Body() body: unknown) { return service.upload(e, req.actorId, body); }
  @Get(':id') batch(@Param('engagementId') e: string, @Param('id') id: string) { return service.getBatch(e, id); }
  @Get(':id/rows') rows(@Param('engagementId') e: string, @Param('id') id: string, @Query('offset') offset = '0', @Query('search') search = '') { const n = Number(offset); if (!Number.isInteger(n) || n < 0 || search.length > 100) throw new BadRequestException('Invalid pagination'); return service.rows(e, id, n, search); }
  @Patch(':id/mappings') @ApiBody({ schema: z.toJSONSchema(mappingSchema) as any }) map(@Param('engagementId') e: string, @Param('id') id: string, @Req() req: any, @Body() body: unknown) { return service.mapBatch(e, id, req.actorId, body); }
  @Post(':id/finalize') @ApiBody({ schema: z.toJSONSchema(finalizeSchema) as any }) finalize(@Param('engagementId') e: string, @Param('id') id: string, @Req() req: any, @Body() body: unknown) { return service.finalize(e, id, req.actorId, body); }
  @Get(':id/summary') summary(@Param('engagementId') e: string, @Param('id') id: string) { return service.aggregate(e, id); }
  @Post(':id/lease') async lease(@Param('engagementId') e: string, @Param('id') id: string, @Req() req: any, @Body() body: unknown) { await service.getBatch(e, id); return editLease(id, req.actorId, body); }
}
