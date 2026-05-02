/**
 * BUG-03 regression: NotificationsModule must import AuthModule.
 *
 * Original bug: NotificationsController used JwtAuthGuard but
 * NotificationsModule didn't import AuthModule, so JwtService couldn't be
 * resolved at boot — the backend crashed at startup.
 *
 * This test reads NotificationsModule's @Module() metadata and asserts that
 * AuthModule is in `imports`. Structural rather than runtime so it doesn't
 * need to spin up a DB or worry about transitive deps.
 */
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';
import 'reflect-metadata';

describe('BUG-03 regression: NotificationsModule wiring', () => {
  it('imports AuthModule (so JwtAuthGuard can resolve JwtService)', () => {
    const imports = Reflect.getMetadata('imports', NotificationsModule) as
      | Array<unknown>
      | undefined;
    expect(imports).toBeDefined();

    const flat = (imports ?? []).flatMap((mod: any) => {
      // Module may be wrapped in forwardRef → it's a function returning the class
      if (typeof mod === 'function') {
        try {
          const ref = mod();
          return [ref?.forwardRef ? ref.forwardRef() : ref];
        } catch {
          return [mod];
        }
      }
      if (mod?.forwardRef) {
        return [mod.forwardRef()];
      }
      return [mod];
    });

    expect(flat).toContain(AuthModule);
  });
});
