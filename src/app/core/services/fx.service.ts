import { Injectable } from '@angular/core';
import { TauriService } from './tauri.service';
import { FxResult } from '../models';

@Injectable({ providedIn: 'root' })
export class FxService {
  constructor(private tauri: TauriService) {}

  async resolveRate(base: string, quote: string, date: string): Promise<FxResult> {
    return this.tauri.invoke<FxResult>('resolve_fx_rate', { base, quote, date });
  }

  async getCachedRates(): Promise<Array<{ base: string; quote: string; rate: number; rateDate: string; source: string }>> {
    return this.tauri.invoke('list_fx_cache');
  }
}
