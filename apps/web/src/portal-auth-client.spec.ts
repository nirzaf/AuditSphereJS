import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiContractError } from './api-client';
import { PortalAuthClient } from './portal-auth-client';

describe('PortalAuthClient contracts', () => {
  let client: PortalAuthClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    client = TestBed.inject(PortalAuthClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('validates portal input and strips undeclared response fields', () => {
    let result: unknown;
    client.login('client@example.test', 'LongEnoughPassword123').subscribe((value) => { result = value; });

    const request = http.expectOne('/api/v1/portal/auth/login');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({ email: 'client@example.test', password: 'LongEnoughPassword123' });
    request.flush({ mustChangePassword: false, sessionToken: 'must-stay-in-the-cookie' });

    expect(result).toEqual({ mustChangePassword: false });
    expect(() => client.login('invalid-email', '')).toThrow();
    expect(() => http.expectOne('/api/v1/portal/auth/login')).toThrow();
  });

  it('rejects a malformed identity response at runtime', () => {
    let failure: unknown;
    client.me().subscribe({ error: (error: unknown) => { failure = error; } });

    http.expectOne('/api/v1/portal/auth/me').flush({ id: 'portal-user', email: 'not-an-email', mustChangePassword: false });
    expect(failure).toBeInstanceOf(ApiContractError);
  });
});
