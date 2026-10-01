import { Injectable, Inject, Module } from '@nestjs/common';
import { db } from './db.js';
export const DATABASE = Symbol('DATABASE');
@Injectable()
export class Readiness {
  constructor(@Inject(DATABASE) private readonly database: typeof db) {}
  async check() { await this.database.$queryRaw`SELECT 1`; return { status: 'ready' }; }
}
@Module({ providers: [{ provide: DATABASE, useValue: db }, Readiness], exports: [DATABASE, Readiness] })
export class RuntimeModule {}
