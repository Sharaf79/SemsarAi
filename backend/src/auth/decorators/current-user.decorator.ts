import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../guards/jwt-auth.guard';

/**
 * Extracts the authenticated user (or a single field) from `request.user`.
 *
 * @example
 * // full payload
 * @CurrentUser() user: JwtPayload
 *
 * // single field
 * @CurrentUser('sub') userId: string
 */
export const CurrentUser = createParamDecorator(
  (field: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: JwtPayload }>();
    return field ? request.user?.[field] : request.user;
  },
);
