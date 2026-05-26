import { Injectable } from '@angular/core';
import { TauriService } from './tauri.service';
import { FxResult } from '../models';

@Injectable({ providedIn: 'root' })
export class FxService {
  constructor(private tauri: TauriService) {}

  async resolveRate(base: string, quote: string, date: string): Promise<FxResult> {
    // Rust param is `target_date` → JS camelCase = `targetDate`
    return this.tauri.invoke<FxResult>('resolve_fx_rate', { base, quote, targetDate: date });
  }

  async getCachedRates(): Promise<Array<{ base: string; quote: string; rate: number; rateDate: string; source: string }>> {
    return this.tauri.invoke('list_fx_cache');
  }
}
