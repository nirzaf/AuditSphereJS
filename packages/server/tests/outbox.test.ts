import { describe, expect, it } from 'vitest';
import {
  parseTrialBalanceOutbox,
  parseTrialBalanceOutboxJob,
} from '../src/platform/outbox.js';

const eventId = 'b1f4cbe8-4c39-4bb3-8b2d-847729679701';
const event = {
  id: eventId,
  operationId: eventId,
  type: 'tb.import',
  payloadVersion: 1,
  payload: {},
};

describe('durable Trial Balance outbox contract', () => {
  it('converts a versioned scoped database record into a stable job envelope', () => {
    expect(parseTrialBalanceOutbox(event)).toEqual({
      outboxEventId: eventId,
      operationId: eventId,
      payloadVersion: 1,
    });
  });

  it('rejects event and operation identity drift', () => {
    expect(() => parseTrialBalanceOutbox({ ...event, operationId: 'd9027f2b-0af8-41de-8bf4-130c7a60f039' })).toThrow();
    expect(() => parseTrialBalanceOutbox({ ...event, id: 'invalid' })).toThrow();
  });

  it('quarantines unknown types, payload versions and payload fields', () => {
    expect(() => parseTrialBalanceOutbox({ ...event, type: 'external.notify' })).toThrow('Unsupported outbox event type or payload version');
    expect(() => parseTrialBalanceOutbox({ ...event, payloadVersion: 2 })).toThrow('Unsupported outbox event type or payload version');
    expect(() => parseTrialBalanceOutbox({ ...event, payload: { recipient: 'unexpected' } })).toThrow('Invalid trial-balance outbox record');
  });

  it('accepts only the exact versioned BullMQ envelope', () => {
    expect(parseTrialBalanceOutboxJob({
      outboxEventId: eventId,
      operationId: eventId,
      payloadVersion: 1,
    })).toEqual({ outboxEventId: eventId, operationId: eventId, payloadVersion: 1 });
    expect(() => parseTrialBalanceOutboxJob({
      outboxEventId: eventId,
      operationId: eventId,
      payloadVersion: 2,
    })).toThrow('Invalid trial-balance queue payload');
    expect(() => parseTrialBalanceOutboxJob({
      outboxEventId: eventId,
      operationId: eventId,
      payloadVersion: 1,
      accessToken: 'must-not-be-in-a-job',
    })).toThrow('Invalid trial-balance queue payload');
  });
});
