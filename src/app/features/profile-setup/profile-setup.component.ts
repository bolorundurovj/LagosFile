import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProfileService } from '../../core/services/profile.service';
import { AuthService } from '../../core/services/auth.service';
import { LucideAngularModule, AlertTriangle } from 'lucide-angular';

@Component({
  selector: 'lf-profile-setup',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="auth-page">
      <div class="auth-card" style="max-width:560px;">
        <div class="auth-card__brand">
          <div class="brand-mark">LF</div>
          <h1 class="brand-name">LagosFile</h1>
        </div>

        <div>
          <h2 class="auth-card__title">Create your taxpayer profile</h2>
          <p class="auth-card__subtitle">
            This information pre-fills your tax filings and exports. Your TIN is mandatory.
          </p>
        </div>

        <form class="auth-card__form" (ngSubmit)="submit()">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="fullName">Full Name *</label>
              <input
                id="fullName" type="text" class="form-input"
                [class.is-invalid]="errors.fullName"
                [(ngModel)]="form.fullName" name="fullName"
                placeholder="As per LIRS records"
              />
              @if (errors.fullName) { <span class="form-error">{{ errors.fullName }}</span> }
            </div>
            <div class="form-group">
              <label class="form-label" for="tin">TIN *</label>
              <input
                id="tin" type="text" class="form-input"
                [class.is-invalid]="errors.tin"
                [(ngModel)]="form.tin" name="tin"
                placeholder="13-digit TIN" maxlength="13"
              />
              @if (errors.tin) { <span class="form-error">{{ errors.tin }}</span> }
              @else { <span class="form-hint">Must be exactly 13 digits.</span> }
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="address">Lagos Address</label>
            <input id="address" type="text" class="form-input"
              [(ngModel)]="form.address" name="address" placeholder="Optional" />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="phone">Phone Number</label>
              <input id="phone" type="tel" class="form-input"
                [(ngModel)]="form.phone" name="phone" placeholder="Optional" />
            </div>
            <div class="form-group">
              <label class="form-label" for="email">Email Address</label>
              <input id="email" type="email" class="form-input"
                [(ngModel)]="form.email" name="email" placeholder="Optional" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="filingAgent">Filing Agent / Company</label>
            <input id="filingAgent" type="text" class="form-input"
              [(ngModel)]="form.filingAgent" name="filingAgent" placeholder="Optional" />
          </div>

          @if (errors.general) {
            <div class="alert alert--error">
              <span class="alert__icon"><lucide-icon name="alert-triangle" [size]="16" [strokeWidth]="2"></lucide-icon></span>
              <div class="alert__content">{{ errors.general }}</div>
            </div>
          }

          <button type="submit" class="btn btn--primary btn--lg w-full" [disabled]="loading">
            @if (loading) { Saving… } @else { Save Profile & Continue }
          </button>
        </form>
      </div>
    </div>
  `,
  styleUrls: ['../pin-entry/auth.styles.scss'],
  styles: [`
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-4);
    }
  `],
})
export class ProfileSetupComponent {
  form = {
    fullName: '', tin: '', address: '', phone: '', email: '', filingAgent: '',
  };
  loading = false;
  errors: { fullName?: string; tin?: string; general?: string } = {};

  private profileService = inject(ProfileService);
  private auth = inject(AuthService);
  private router = inject(Router);

  async submit(): Promise<void> {
    this.errors = {};
    if (!this.form.fullName.trim()) {
      this.errors.fullName = 'Full name is required.';
    }
    const tinError = this.profileService.validateTin(this.form.tin);
    if (tinError) this.errors.tin = tinError;
    if (Object.keys(this.errors).length) return;

    this.loading = true;
    try {
      const taxpayer = await this.profileService.create({
        fullName: this.form.fullName.trim(),
        tin: this.form.tin,
        address: this.form.address || undefined,
        phone: this.form.phone || undefined,
        email: this.form.email || undefined,
        filingAgent: this.form.filingAgent || undefined,
      });
      this.auth.setTaxpayer(taxpayer);
      this.router.navigate(['/dashboard']);
    } catch (e: any) {
      this.errors.general = e?.toString() ?? 'Failed to create profile.';
    } finally {
      this.loading = false;
    }
  }
}
