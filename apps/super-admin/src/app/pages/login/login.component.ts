import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  template: `
    <main class="dashboard-main flex min-h-screen items-center justify-center bg-base-200 p-4">
      <div class="card w-full max-w-sm bg-base-100">
        <div class="card-body">
          <h1 class="type-title">Dukarun Platform</h1>
          <p class="text-sm text-base-content/70">Staff sign-in</p>

          @if (denied()) {
            <div class="alert alert-error mt-3">
              <span class="text-sm"> Signed in, but this account is not a platform admin. </span>
            </div>
          }

          <form (submit)="$event.preventDefault(); signIn()" class="mt-4 flex flex-col gap-4">
            <label class="form-control">
              <span class="label-text mb-1">Email</span>
              <input
                type="email"
                class="input input-bordered w-full"
                autocomplete="email"
                [formControl]="email"
              />
            </label>
            <label class="form-control">
              <span class="label-text mb-1">Password</span>
              <input
                type="password"
                class="input input-bordered w-full"
                autocomplete="current-password"
                [formControl]="password"
              />
            </label>
            <button type="submit" class="btn btn-primary min-h-11" [disabled]="busy()">
              {{ busy() ? 'Signing in…' : 'Sign in' }}
            </button>
          </form>

          @if (error()) {
            <p class="mt-2 text-sm text-error">{{ error() }}</p>
          }
        </div>
      </div>
    </main>
  `,
})
export class LoginComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly email = new FormControl('', { nonNullable: true });
  protected readonly password = new FormControl('', { nonNullable: true });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly denied = signal(false);

  ngOnInit(): void {
    this.denied.set(this.route.snapshot.queryParamMap.has('denied'));
  }

  protected async signIn(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.denied.set(false);
    try {
      await this.auth.signIn(this.email.value.trim(), this.password.value);
      if (!this.auth.isPlatformAdmin()) {
        await this.auth.signOut();
        this.denied.set(true);
        return;
      }
      await this.router.navigate(['/']);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      this.busy.set(false);
    }
  }
}
