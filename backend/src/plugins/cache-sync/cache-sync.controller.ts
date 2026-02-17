import { Controller, ForbiddenException, Get, Logger, Query, Sse } from '@nestjs/common';
import { Allow, Permission, RequestContext } from '@vendure/core';
import { Observable } from 'rxjs';
import { concat, defer, from } from 'rxjs';
import { filter, map, switchMap, tap } from 'rxjs/operators';
import { CtxFromReq } from './ctx-from-req.decorator';
import { CacheSyncRecentBufferService } from './cache-sync-recent-buffer.service';
import { CacheSyncStreamService } from './cache-sync-stream.service';
import type { CacheSyncMessage } from './cache-sync.types';

/**
 * Cache-sync SSE under admin-api. Auth via Vendure AuthGuard (cookie-session + tokenMethod cookie-first).
 * On connect, sends catch-up (last N events for channel) then live stream.
 */
@Controller('admin-api/cache-sync')
export class CacheSyncController {
  private readonly logger = new Logger(CacheSyncController.name);

  constructor(
    private readonly streamService: CacheSyncStreamService,
    private readonly recentBuffer: CacheSyncRecentBufferService
  ) {}

  @Get('stream')
  @Allow(Permission.ReadSettings)
  @Sse()
  stream(
    @CtxFromReq() ctx: RequestContext | null,
    @Query('channelId') channelIdParam: string
  ): Observable<{ data: CacheSyncMessage }> {
    if (!ctx) {
      throw new ForbiddenException();
    }

    const channelId = channelIdParam?.trim() || ctx.channelId?.toString();
    if (!channelId) {
      return new Observable(sub => {
        sub.error(new Error('channelId required'));
      });
    }
    this.logger.log(`CacheSync: client subscribed channelId=${channelId}`);

    const liveStream = this.streamService.getMessageStream().pipe(
      filter(msg => msg.channelId === channelId),
      tap(msg => {
        this.logger.log(
          `CacheSync: sending to client entityType=${msg.entityType} action=${msg.action} channelId=${msg.channelId}`
        );
      }),
      map(msg => ({ data: msg }))
    );

    return defer(() => from(this.recentBuffer.getRecent(channelId))).pipe(
      switchMap(catchUp => {
        const catchUpEmissions = from(catchUp).pipe(map(msg => ({ data: msg })));
        return concat(catchUpEmissions, liveStream);
      })
    );
  }
}
