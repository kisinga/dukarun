import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApolloService } from './apollo.service';
import { AUTHENTICATE, PLATFORM_STATS } from '../graphql/operations.graphql';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apollo = inject(ApolloService);
  private readonly router = inject(Router);

  private readonly loggedInSignal = signal<boolean>(false);
  readonly isLoggedIn = this.loggedInSignal.asReadonly();

  async login(username: string, password: string): Promise<{ success: boolean; error?: string }> {
    const client = this.apollo.getClient();
    try {
      await client.mutate({
        mutation: AUTHENTICATE,
        variables: { username, password },
        fetchPolicy: 'no-cache',
      });
      const ok = await this.verifySuperAdmin();
      if (ok) {
        this.loggedInSignal.set(true);
        return { success: true };
      }
      return { success: false, error: 'Not a Super Admin' };
    } catch (err: any) {
      const msg = err?.graphQLErrors?.[0]?.message ?? err?.message ?? 'Login failed';
      return { success: false, error: msg };
    }
  }

  async verifySuperAdmin(): Promise<boolean> {
    const client = this.apollo.getClient();
    try {
      await client.query({
        query: PLATFORM_STATS,
        fetchPolicy: 'no-cache',
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Call on app init or guard to restore session from cookie. */
  async checkSession(): Promise<boolean> {
    const ok = await this.verifySuperAdmin();
    this.loggedInSignal.set(ok);
    return ok;
  }

  logout(): void {
    this.loggedInSignal.set(false);
    this.router.navigate(['/login']);
  }
}
