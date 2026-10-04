import { Body, Controller, Get, Param, Post, Query, SerializeOptions, StandardSchemaSerializerInterceptor, StandardSchemaValidationPipe, UseGuards, UseInterceptors, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  apiProblemSchema, notificationInboxQuerySchema, notificationReadResultSchema, notificationReadSchema,
  notificationSchema, outboundMessageSchema, outboundMutationResultSchema, outboundReconcileSchema, outboundRetrySchema,
} from '@auditsphere/contracts';
import { InternalGuard } from './auth.js';
import { ReqActor } from './request-actor.js';
import { listNotificationInbox, listOutboundMessages, markNotificationRead, reconcileUnknownOutbound, retryFailedOutbound } from './notifications.js';

@ApiTags('Notifications') @ApiBearerAuth() @ApiDefaultResponse({ standardSchema: apiProblemSchema }) @UseGuards(InternalGuard) @UsePipes(new StandardSchemaValidationPipe()) @UseInterceptors(StandardSchemaSerializerInterceptor)
@Controller('engagements/:engagementId/notifications')
export class NotificationController {
  @Get('inbox')
  @ApiOkResponse({ standardSchema: notificationSchema, isArray: true })
  @SerializeOptions({ schema: notificationSchema })
  async inbox(@Param('engagementId') engagementId: string, @ReqActor() actorId: string, @Query({ schema: notificationInboxQuerySchema }) query: { unreadOnly?: 'true' | 'false' }) {
    return (await listNotificationInbox(actorId, engagementId, query.unreadOnly === 'true')).map(row => ({ ...row, createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null }));
  }

  @Post(':notificationId/read')
  @ApiOkResponse({ standardSchema: notificationReadResultSchema })
  @SerializeOptions({ schema: notificationReadResultSchema })
  markRead(@Param('engagementId') engagementId: string, @Param('notificationId') id: string, @ReqActor() actorId: string, @Body({ schema: notificationReadSchema }) body: { expectedVersion: number }) {
    return markNotificationRead(actorId, engagementId, id, body.expectedVersion);
  }

  @Get('outbound')
  @ApiOkResponse({ standardSchema: outboundMessageSchema, isArray: true })
  @SerializeOptions({ schema: outboundMessageSchema })
  async outbound(@Param('engagementId') engagementId: string, @ReqActor() actorId: string) {
    return (await listOutboundMessages(actorId, engagementId)).map(row => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }));
  }

  @Post('outbound/:id/retry')
  @ApiOkResponse({ standardSchema: outboundMutationResultSchema })
  @SerializeOptions({ schema: outboundMutationResultSchema })
  retry(@Param('engagementId') engagementId: string, @Param('id') id: string, @ReqActor() actorId: string, @Body({ schema: outboundRetrySchema }) body: { expectedVersion: number; reason: string }) {
    return retryFailedOutbound(actorId, engagementId, id, body.expectedVersion, body.reason);
  }

  @Post('outbound/:id/reconcile')
  @ApiOkResponse({ standardSchema: outboundMutationResultSchema })
  @SerializeOptions({ schema: outboundMutationResultSchema })
  reconcile(@Param('engagementId') engagementId: string, @Param('id') id: string, @ReqActor() actorId: string, @Body({ schema: outboundReconcileSchema }) body: { expectedVersion: number; outcome: 'SENT' | 'NOT_SENT'; evidenceReference: string; reason: string }) {
    return reconcileUnknownOutbound(actorId, engagementId, id, body.expectedVersion, body.outcome, body.evidenceReference, body.reason);
  }
}
