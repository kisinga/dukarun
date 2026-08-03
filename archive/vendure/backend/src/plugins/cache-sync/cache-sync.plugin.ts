import { PluginCommonModule, VendurePlugin } from '@vendure/core';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieSession = require('cookie-session') as (
  opts: Record<string, unknown>
) => (req: unknown, res: unknown, next: () => void) => void;
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { CacheSyncController } from './cache-sync.controller';
import { CacheSyncRecentBufferService } from './cache-sync-recent-buffer.service';
import { CacheSyncStreamService } from './cache-sync-stream.service';

const STREAM_PATH = '/admin-api/cache-sync/stream';

/**
 * Per Vendure docs (AuthOptions, CookieOptions, REST endpoint guide):
 * - tokenMethod 'cookie' + cookieOptions ensure session is in req.session; AuthGuard reads req.session.token.
 * - REST endpoints use @Allow(Permission.XXX) and @Ctx(); AuthGuard runs first.
 * - apiOptions.middleware with route + beforeListen runs at Express level before Nest.
 *
 * Vendure applies cookie-session only for route adminApiPath ('admin-api'); Nest path matching may not
 * match subpaths like admin-api/cache-sync/stream, so we register cookie-session explicitly for the stream path.
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [CacheSyncRecentBufferService, CacheSyncStreamService],
  controllers: [CacheSyncController],
  compatibility: VENDURE_COMPATIBILITY_VERSION,
  configuration: config => {
    const opts = config.authOptions?.cookieOptions;
    if (opts && typeof opts.name === 'object' && opts.name?.admin) {
      const cookieHandler = cookieSession({ ...opts, name: opts.name.admin });
      const middleware = config.apiOptions.middleware ?? [];
      config.apiOptions.middleware = [
        ...middleware,
        { route: STREAM_PATH, handler: cookieHandler, beforeListen: true },
        { route: STREAM_PATH, handler: cookieHandler },
      ];
    }
    return config;
  },
})
export class CacheSyncPlugin {}
