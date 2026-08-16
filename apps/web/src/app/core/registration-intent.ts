import type { ParamMap } from '@angular/router';

export function hasRegistrationIntent(params: ParamMap): boolean {
  return params.get('register') === '1' || params.has('plan') || params.has('blog_ref');
}
