import { Injectable } from '@angular/core';
import { TauriService } from './tauri.service';
import { Taxpayer } from '../models';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  constructor(private tauri: TauriService) {}

  async create(data: Omit<Taxpayer, 'id' | 'createdAt'>): Promise<Taxpayer> {
    return this.tauri.invoke<Taxpayer>('create_profile', { profile: data });
  }

  async get(): Promise<Taxpayer | null> {
    return this.tauri.invoke<Taxpayer | null>('get_profile');
  }

  async update(data: Partial<Omit<Taxpayer, 'id' | 'createdAt'>>): Promise<Taxpayer> {
    return this.tauri.invoke<Taxpayer>('update_profile', { profile: data });
  }

  /** Validate TIN — exactly 13 numeric digits */
  validateTin(tin: string): string | null {
    if (!/^\d{13}$/.test(tin)) {
      return 'TIN must be exactly 13 digits (numbers only).';
    }
    return null;
  }
}
