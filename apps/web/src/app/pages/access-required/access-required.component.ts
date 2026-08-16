import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';

@Component({
  selector: 'app-access-required',
  imports: [RouterLink],
  template: `
    <main class="dashboard-main flex min-h-screen items-center justify-center bg-base-200 p-4">
      <div class="card w-full max-w-md bg-base-100">
        <div class="card-body gap-4">
          <div>
            <h1 class="type-title">No workspace access yet</h1>
            <p class="mt-2 text-sm text-base-content/70">
              We could not find a company invitation for the phone number you verified. Ask your
              company administrator to invite that exact number, then check again.
            </p>
          </div>

          @if (error()) {
            <div class="alert alert-error text-sm" role="alert">{{ error() }}</div>
          }

          <button type="button" class="btn btn-primary" [disabled]="checking()" (click)="check()">
            {{ checking() ? 'Checking…' : 'Check for invitation' }}
          </button>
          <button type="button" class="btn btn-ghost" [disabled]="checking()" (click)="signOut()">
            Use a different phone number
          </button>

          <div class="divider text-xs text-base-content/45">or</div>
          <a routerLink="/register" class="btn btn-outline">Create a new company</a>
          <p class="text-center text-xs text-base-content/50">
            Creating a company is separate from joining an existing one.
          </p>
        </div>
      </div>
    </main>
  `,
})
export class AccessRequiredComponent {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  protected readonly checking = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async check(): Promise<void> {
    this.checking.set(true);
    this.error.set(null);
    try {
      await this.supabase.claimTeamInvitations();
      const { error } = await this.supabase.client.auth.refreshSession();
      if (error) throw error;
      if (this.supabase.claims()?.company_id) {
        await this.router.navigate(['/dashboard']);
        return;
      }
      this.error.set('No active invitation was found. Check the phone number with your admin.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Invitation check failed');
    } finally {
      this.checking.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    this.checking.set(true);
    this.error.set(null);
    try {
      const { error } = await this.supabase.client.auth.signOut();
      if (error) throw error;
      await this.router.navigate(['/login']);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Sign out failed');
    } finally {
      this.checking.set(false);
    }
  }
}
