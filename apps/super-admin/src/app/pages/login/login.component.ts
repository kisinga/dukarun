import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  template: `
    <main class="grid min-h-screen bg-base-200 lg:grid-cols-[minmax(0,1.1fr)_minmax(28rem,0.9fr)]">
      <section
        class="relative hidden overflow-hidden bg-neutral p-12 text-neutral-content lg:flex lg:flex-col lg:justify-between"
      >
        <div
          class="absolute -top-32 -left-24 size-[30rem] rounded-full bg-primary/20 blur-3xl"
        ></div>
        <div class="relative flex items-center gap-3">
          <span class="flex size-11 items-center justify-center rounded-xl bg-white/10">
            <img src="/assets/logo/dukarun-icon.svg" alt="" class="h-8 w-8" />
          </span>
          <div>
            <p class="font-bold tracking-tight">Dukarun</p>
            <p class="text-xs text-neutral-content/55">Platform operations</p>
          </div>
        </div>
        <div class="relative max-w-xl">
          <p class="text-xs font-bold uppercase tracking-[0.15em] text-primary">Internal console</p>
          <h1 class="mt-4 text-4xl leading-tight font-bold tracking-[-0.035em]">
            Run the platform with clarity and care.
          </h1>
          <p class="mt-5 max-w-lg text-base leading-relaxed text-neutral-content/60">
            Review tenants, manage subscriptions, publish content and monitor platform health from
            one secure workspace.
          </p>
        </div>
        <p class="relative text-xs text-neutral-content/40">Restricted to authorized staff</p>
      </section>

      <section class="flex items-center justify-center p-5 sm:p-10">
        <div class="w-full max-w-md">
          <div class="mb-8 lg:hidden">
            <span class="flex size-11 items-center justify-center rounded-xl bg-primary/10">
              <img src="/assets/logo/dukarun-icon.svg" alt="" class="h-8 w-8" />
            </span>
          </div>
          <p class="text-xs font-bold uppercase tracking-[0.12em] text-primary">Superadmin</p>
          <h1 class="mt-2 text-3xl font-bold tracking-tight">Welcome back</h1>
          <p class="mt-2 text-sm text-base-content/55">Sign in with your platform staff account.</p>

          <div class="card mt-8 bg-base-100">
            <div class="card-body p-5 sm:p-7">
              @if (denied()) {
                <div class="alert alert-error mb-4" role="alert">
                  <span class="text-sm">
                    Signed in, but this account is not a platform admin.
                  </span>
                </div>
              }

              <form (submit)="$event.preventDefault(); signIn()" class="flex flex-col gap-5">
                <label class="form-control">
                  <span class="label-text mb-1.5 font-semibold">Email address</span>
                  <input
                    type="email"
                    class="input input-bordered w-full"
                    autocomplete="email"
                    [formControl]="email"
                  />
                </label>
                <label class="form-control">
                  <span class="label-text mb-1.5 font-semibold">Password</span>
                  <input
                    type="password"
                    class="input input-bordered w-full"
                    autocomplete="current-password"
                    [formControl]="password"
                  />
                </label>
                <button type="submit" class="btn btn-primary mt-1 min-h-12" [disabled]="busy()">
                  @if (busy()) {
                    <span class="loading loading-spinner loading-sm"></span>
                  }
                  {{ busy() ? 'Signing in…' : 'Sign in' }}
                </button>
              </form>

              @if (error()) {
                <p class="mt-3 text-sm text-error" role="alert">{{ error() }}</p>
              }
            </div>
          </div>
          <p class="mt-5 text-center text-xs leading-relaxed text-base-content/40">
            Actions in this workspace may affect live Dukarun tenants.
          </p>
        </div>
      </section>
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
