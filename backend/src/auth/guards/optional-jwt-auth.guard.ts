import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './jwt-auth.guard';

/**
 * Optional JWT guard.
 *
 * Unlike `JwtAuthGuard`, this guard never throws an exception.
 * - If a valid `Authorization: Bearer <token>` header is present the decoded
 *   payload is attached to `request.user` (same as JwtAuthGuard).
 * - If the header is absent or the token is invalid/expired,
 *   `request.user` is set to `undefined` and the request is allowed through.
 *
 * The controller is responsible for deciding whether an unauthenticated
 * request is acceptable (e.g. by falling back to an anonymous userId from
 * the request body).
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: JwtPayload }>();

    const auth = request.headers['authorization'];
    if (!auth?.startsWith('Bearer ')) {
      request.user = undefined;
      return true;
    }

    try {
      request.user = this.jwtService.verify<JwtPayload>(auth.slice(7));
    } catch {
      // Invalid / expired token — treat as unauthenticated, do not reject.
      request.user = undefined;
    }
    return true;
  }
}
