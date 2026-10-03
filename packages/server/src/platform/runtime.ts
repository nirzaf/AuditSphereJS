import { Injectable, Inject, Module } from '@nestjs/common';
import { db } from './db.js';
import { ClockModule } from './clock.js';
export const DATABASE = Symbol('DATABASE');
@Injectable()
export class Readiness {
  constructor(@Inject(DATABASE) private readonly database: typeof db) {}
  async check() {
    await this.database.$queryRaw`SELECT 1`;
    if (process.env.NODE_ENV === 'production') {
      const rows = await this.database.$queryRaw<Array<{ privileged: boolean }>>`SELECT (rolsuper OR rolcreatedb OR rolcreaterole OR has_schema_privilege(current_user, 'public', 'CREATE')) AS privileged FROM pg_roles WHERE rolname = current_user`;
      if (rows[0]?.privileged !== false) throw new Error('Runtime database credentials are overprivileged');
    }
    return { status: 'ready' };
  }
}
@Module({ imports: [ClockModule], providers: [{ provide: DATABASE, useValue: db }, Readiness], exports: [DATABASE, Readiness, ClockModule] })
export class RuntimeModule {}
