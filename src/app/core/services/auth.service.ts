import { Injectable, signal } from '@angular/core';
import { TauriService } from './tauri.service';
import { AppStatus, Taxpayer } from '../models';

export type AuthState = 'locked' | 'unlocked' | 'needs_profile' | 'needs_pin_setup';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _state = signal<AuthState>('locked');
  private readonly _taxpayer = signal<Taxpayer | null>(null);
  private readonly _hasRecovery = signal(false);
  private readonly _biometricAvailable = signal(false);
  private readonly _biometricEnabled = signal(false);

  readonly state = this._state.asReadonly();
  readonly taxpayer = this._taxpayer.asReadonly();
  readonly hasRecovery = this._hasRecovery.asReadonly();
  readonly biometricAvailable = this._biometricAvailable.asReadonly();
  readonly biometricEnabled = this._biometricEnabled.asReadonly();

  constructor(private tauri: TauriService) {}

  async init(): Promise<void> {
    const status = await this.tauri.invoke<AppStatus>('check_app_status');
    this._hasRecovery.set(status.hasRecovery);
    this._biometricAvailable.set(status.biometricAvailable);
    this._biometricEnabled.set(status.biometricEnabled);
    this._state.set(status.hasDb ? 'locked' : 'needs_pin_setup');
  }

  async setupPin(pin: string): Promise<void> {
    await this.tauri.invoke('setup_pin', { pin });
    this._state.set('needs_profile');
  }

  async unlock(pin: string): Promise<{ success: boolean; error?: string }> {
    try {
      const taxpayer = await this.tauri.invoke<Taxpayer | null>('unlock_db', { pin });
      this._setUnlocked(taxpayer);
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  async unlockWithBiometric(): Promise<{ success: boolean; error?: string }> {
    try {
      const taxpayer = await this.tauri.invoke<Taxpayer | null>('unlock_with_biometric');
      this._setUnlocked(taxpayer);
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async enableBiometric(): Promise<void> {
    await this.tauri.invoke('enable_biometric');
    this._biometricEnabled.set(true);
  }

  async disableBiometric(): Promise<void> {
    await this.tauri.invoke('disable_biometric');
    this._biometricEnabled.set(false);
  }

  async lock(): Promise<void> {
    await this.tauri.invoke('lock_db');
    this._taxpayer.set(null);
    this._state.set('locked');
  }

  // Recovery

  async setupRecovery(
    questions: [string, string, string],
    answers: [string, string, string],
  ): Promise<void> {
    await this.tauri.invoke('setup_recovery', {
      question1: questions[0], question2: questions[1], question3: questions[2],
      answer1: answers[0],     answer2: answers[1],     answer3: answers[2],
    });
    this._hasRecovery.set(true);
  }

  async getRecoveryQuestions(): Promise<string[]> {
    return this.tauri.invoke<string[]>('get_recovery_questions');
  }

  async recoverWithAnswers(
    answers: [string, string, string],
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const taxpayer = await this.tauri.invoke<Taxpayer | null>('recover_with_answers', {
        answer1: answers[0], answer2: answers[1], answer3: answers[2],
      });
      this._setUnlocked(taxpayer);
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async resetPin(newPin: string): Promise<void> {
    await this.tauri.invoke('reset_pin', { newPin });
    this._hasRecovery.set(false);
  }

  // Change PIN

  async changePin(currentPin: string, newPin: string): Promise<void> {
    await this.tauri.invoke('change_pin', { currentPin, newPin });
    this._hasRecovery.set(false);
  }

  // Backup / Restore

  async backupDb(destPath: string): Promise<void> {
    await this.tauri.invoke('backup_db', { destPath });
  }

  async restoreDb(srcPath: string): Promise<void> {
    await this.tauri.invoke('restore_db', { srcPath });
  }

  // Helpers

  setTaxpayer(t: Taxpayer): void {
    this._taxpayer.set(t);
    this._state.set('unlocked');
  }

  isUnlocked(): boolean {
    return this._state() === 'unlocked';
  }

  private _setUnlocked(taxpayer: Taxpayer | null): void {
    if (taxpayer) {
      this._taxpayer.set(taxpayer);
      this._state.set('unlocked');
    } else {
      this._state.set('needs_profile');
    }
  }
}
