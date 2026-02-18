import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  username = '';
  password = '';
  error = signal<string | null>(null);
  loading = signal(false);

  async onSubmit(): Promise<void> {
    this.error.set(null);
    this.loading.set(true);
    try {
      const result = await this.auth.login(this.username, this.password);
      if (result.success) {
        await this.router.navigate(['/dashboard']);
      } else {
        this.error.set(result.error ?? 'Login failed');
      }
    } finally {
      this.loading.set(false);
    }
  }
}
