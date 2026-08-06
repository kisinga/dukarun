import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { getRequestContextFromReq } from '../../infrastructure/audit/get-request-context';
import { Request } from 'express';

/**
 * Param decorator that returns RequestContext from the current HTTP request.
 * Returns null if AuthGuard has not set context on the request.
 */
export const CtxFromReq = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContext | null => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req) {
      return null;
    }
    return getRequestContextFromReq(req);
  }
);
