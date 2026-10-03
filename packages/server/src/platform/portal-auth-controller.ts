import {
  ApiCreatedResponse, ApiDefaultResponse, ApiOkResponse, ApiTags,
} from '@nestjs/swagger';
import {
  Body, Controller, Get, Post, Req, Res, SerializeOptions, StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe, UnauthorizedException, UseInterceptors, UsePipes,
} from '@nestjs/common';
import {
  apiProblemSchema, portalAuthResultSchema, portalFirstPasswordRequestSchema,
  portalIdentitySchema, portalInvitationRedeemRequestSchema, portalLoginRequestSchema,
  portalLogoutResultSchema, portalPasswordResetRequestSchema, portalPasswordResetResultSchema,
} from '@auditsphere/contracts';
import type {
  PortalFirstPasswordRequest, PortalInvitationRedeemRequest, PortalLoginRequest,
  PortalPasswordResetRequest,
} from '@auditsphere/contracts';
import {
  completePortalFirstLogin,
  completePortalPasswordReset,
  loginPortalUser,
  logoutPortalSession,
  redeemPortalInvitation,
  resolvePortalSession,
} from './portal-auth.js';

type PortalRequest = { headers: { cookie?: string; origin?: string; 'x-csrf-token'?: string } };
type PortalReply = { header: (name: string, value: string | string[]) => PortalReply };

function cookieValue(request: PortalRequest, name: string): string | null {
  for (const item of request.headers.cookie?.split(';') ?? []) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(item.slice(separator + 1).trim()); } catch { return null; }
  }
  return null;
}

function requireSameOrigin(request: PortalRequest): void {
  const configured = process.env.WEB_ORIGIN;
  let configuredOrigin = '';
  try { configuredOrigin = new URL(configured ?? '').origin; } catch { /* fail closed below */ }
  if (!request.headers.origin || request.headers.origin !== configuredOrigin) throw new UnauthorizedException('Portal request origin is not allowed');
}

function setPortalCookies(reply: PortalReply, sessionToken: string, csrfToken: string, expiresAt: Date): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  reply.header('set-cookie', [
    `auditsphere_portal_session=${encodeURIComponent(sessionToken)}; Path=/api/v1/portal; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
    `auditsphere_portal_csrf=${encodeURIComponent(csrfToken)}; Path=/api/v1/portal; SameSite=Strict; Max-Age=${maxAge}${secure}`,
  ]);
}

function clearPortalCookies(reply: PortalReply): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  reply.header('set-cookie', [
    `auditsphere_portal_session=; Path=/api/v1/portal; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
    `auditsphere_portal_csrf=; Path=/api/v1/portal; SameSite=Strict; Max-Age=0${secure}`,
  ]);
}

function csrfCookie(request: PortalRequest): string {
  const cookie = cookieValue(request, 'auditsphere_portal_csrf');
  const header = request.headers['x-csrf-token'];
  if (!cookie || !header || cookie.length !== 64 || header.length !== 64 || cookie !== header) throw new UnauthorizedException('Portal security token is invalid');
  return cookie;
}

@Controller('portal/auth')
@ApiTags('Portal authentication')
@ApiDefaultResponse({ standardSchema: apiProblemSchema })
@UsePipes(new StandardSchemaValidationPipe())
@UseInterceptors(StandardSchemaSerializerInterceptor)
export class PortalAuthController {
  @Post('invitations/redeem')
  @ApiCreatedResponse({ standardSchema: portalAuthResultSchema })
  @SerializeOptions({ schema: portalAuthResultSchema })
  async redeem(@Body({ schema: portalInvitationRedeemRequestSchema }) body: PortalInvitationRedeemRequest, @Req() request: PortalRequest, @Res({ passthrough: true }) reply: PortalReply) {
    requireSameOrigin(request);
    const credentials = await redeemPortalInvitation(body.token);
    setPortalCookies(reply, credentials.sessionToken, credentials.csrfToken, credentials.expiresAt);
    return { mustChangePassword: credentials.mustChangePassword };
  }

  @Post('login')
  @ApiCreatedResponse({ standardSchema: portalAuthResultSchema })
  @SerializeOptions({ schema: portalAuthResultSchema })
  async login(@Body({ schema: portalLoginRequestSchema }) body: PortalLoginRequest, @Req() request: PortalRequest, @Res({ passthrough: true }) reply: PortalReply) {
    requireSameOrigin(request);
    const credentials = await loginPortalUser(body.email, body.password);
    setPortalCookies(reply, credentials.sessionToken, credentials.csrfToken, credentials.expiresAt);
    return { mustChangePassword: credentials.mustChangePassword };
  }

  @Get('me')
  @ApiOkResponse({ standardSchema: portalIdentitySchema })
  @SerializeOptions({ schema: portalIdentitySchema })
  async me(@Req() request: PortalRequest) {
    const sessionToken = cookieValue(request, 'auditsphere_portal_session');
    if (!sessionToken) throw new UnauthorizedException('Portal authentication required');
    const session = await resolvePortalSession(sessionToken, true);
    return session.identity;
  }

  @Post('first-password')
  @ApiCreatedResponse({ standardSchema: portalAuthResultSchema })
  @SerializeOptions({ schema: portalAuthResultSchema })
  async firstPassword(@Body({ schema: portalFirstPasswordRequestSchema }) body: PortalFirstPasswordRequest, @Req() request: PortalRequest, @Res({ passthrough: true }) reply: PortalReply) {
    requireSameOrigin(request);
    const sessionToken = cookieValue(request, 'auditsphere_portal_session');
    if (!sessionToken) throw new UnauthorizedException('Portal authentication required');
    const credentials = await completePortalFirstLogin(sessionToken, csrfCookie(request), body.password);
    setPortalCookies(reply, credentials.sessionToken, credentials.csrfToken, credentials.expiresAt);
    return { mustChangePassword: false };
  }

  @Post('password-reset/complete')
  @ApiCreatedResponse({ standardSchema: portalPasswordResetResultSchema })
  @SerializeOptions({ schema: portalPasswordResetResultSchema })
  async completePasswordReset(@Body({ schema: portalPasswordResetRequestSchema }) body: PortalPasswordResetRequest, @Req() request: PortalRequest) {
    requireSameOrigin(request);
    await completePortalPasswordReset(body.token, body.password);
    return { passwordReset: true, signedOut: true };
  }

  @Post('logout')
  @ApiCreatedResponse({ standardSchema: portalLogoutResultSchema })
  @SerializeOptions({ schema: portalLogoutResultSchema })
  async logout(@Req() request: PortalRequest, @Res({ passthrough: true }) reply: PortalReply) {
    requireSameOrigin(request);
    const sessionToken = cookieValue(request, 'auditsphere_portal_session');
    if (!sessionToken) throw new UnauthorizedException('Portal authentication required');
    await logoutPortalSession(sessionToken, csrfCookie(request));
    clearPortalCookies(reply);
    return { signedOut: true };
  }
}
