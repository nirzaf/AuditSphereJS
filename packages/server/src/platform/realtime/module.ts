import { Module } from '@nestjs/common';
import { RealtimeGateway } from './gateway.js';

@Module({ providers: [RealtimeGateway] })
export class RealtimeModule {}
