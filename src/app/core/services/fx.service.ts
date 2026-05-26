import { Injectable } from '@angular/core';
import { TauriService } from './tauri.service';
import { FxResult } from '../models';

export interface FxCacheEntry {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  rateDate: string;
  source: string;
  fetchedAt: string;
}

@Injectable({ providedIn: 'root' })
export class FxService {
  constructor(private tauri: TauriService) {}

  async resolveRate(base: string, quote: string, date: string): Promise<FxResult> {
    return this.tauri.invoke<FxResult>('resolve_fx_rate', { base, quote, targetDate: date });
  }

  async getCachedRates(): Promise<FxCacheEntry[]> {
    return this.tauri.invoke<FxCacheEntry[]>('list_fx_cache');
  }

  async clearCache(): Promise<void> {
    return this.tauri.invoke('clear_fx_cache');
  }
}
