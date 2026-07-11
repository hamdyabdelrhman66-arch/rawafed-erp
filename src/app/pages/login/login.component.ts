import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

@Component({
  selector: 'raw-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatButtonModule, MatIconModule, TranslatePipe],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  username = '';
  password = '';
  error = '';
  isLoggingIn = false;

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly i18n: I18nService
  ) {}

  async login(): Promise<void> {
    this.error = '';
    this.isLoggingIn = true;

    try {
      if (!(await this.auth.login(this.username, this.password))) {
        this.error = this.i18n.t('login.invalid');
        return;
      }

      const session = this.auth.session();
      this.router.navigate([session ? this.auth.homeForRole(session.role) : '/admin']);
    } finally {
      this.isLoggingIn = false;
    }
  }
}
