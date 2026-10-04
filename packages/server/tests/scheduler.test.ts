import { describe, expect, it } from 'vitest';
import {
  parseScheduledDeadlineOutbox,
  parseScheduledDeadlineOutboxJob,
} from '../src/platform/outbox.js';

const id = 'b1f4cbe8-4c39-4bb3-8b2d-847729679701';
const event = {
  id,
  operationId: id,
  deadlineId: id,
  type: 'scheduler.deadline',
  payloadVersion: 1,
  payload: {},
};

describe('durable deadline queue contract', () => {
  it('creates one deterministic operation envelope from its scoped database row', () => {
    expect(parseScheduledDeadlineOutbox(event)).toEqual({
      outboxEventId: id,
      operationId: id,
      deadlineId: id,
      payloadVersion: 1,
    });
  });

  it('rejects changed operation/deadline identity and malformed scoped rows', () => {
    expect(() => parseScheduledDeadlineOutbox({ ...event, operationId: 'd9027f2b-0af8-41de-8bf4-130c7a60f039' })).toThrow('Invalid scheduled-deadline outbox record');
    expect(() => parseScheduledDeadlineOutbox({ ...event, deadlineId: null })).toThrow('Invalid scheduled-deadline outbox record');
    expect(() => parseScheduledDeadlineOutbox({ ...event, type: 'tb.import' })).toThrow('Unsupported scheduled-deadline outbox event');
    expect(() => parseScheduledDeadlineOutbox({ ...event, payloadVersion: 2 })).toThrow('Unsupported scheduled-deadline outbox event');
    expect(() => parseScheduledDeadlineOutbox({ ...event, payload: { arbitrary: true } })).toThrow('Invalid scheduled-deadline outbox record');
  });

  it('accepts only a versioned BullMQ envelope with the same stable identity', () => {
    expect(parseScheduledDeadlineOutboxJob({
      outboxEventId: id,
      operationId: id,
      deadlineId: id,
      payloadVersion: 1,
    })).toEqual({ outboxEventId: id, operationId: id, deadlineId: id, payloadVersion: 1 });
    expect(() => parseScheduledDeadlineOutboxJob({
      outboxEventId: id,
      operationId: id,
      deadlineId: 'd9027f2b-0af8-41de-8bf4-130c7a60f039',
      payloadVersion: 1,
    })).toThrow('Invalid scheduled-deadline queue payload');
    expect(() => parseScheduledDeadlineOutboxJob({
      outboxEventId: id,
      operationId: id,
      deadlineId: id,
      payloadVersion: 1,
      accessToken: 'must-not-be-in-a-job',
    })).toThrow('Invalid scheduled-deadline queue payload');
  });
});
