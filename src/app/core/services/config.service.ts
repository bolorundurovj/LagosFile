import { Injectable, signal } from '@angular/core';
import { TauriService } from './tauri.service';
import { TaxConfig } from '../models';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly _active = signal<TaxConfig | null>(null);
  readonly activeConfig = this._active.asReadonly();

  constructor(private tauri: TauriService) {}

  async loadActive(): Promise<TaxConfig> {
    const config = await this.tauri.invoke<TaxConfig>('get_active_config');
    this._active.set(config);
    return config;
  }

  async listVersions(): Promise<TaxConfig[]> {
    return this.tauri.invoke<TaxConfig[]>('list_configs');
  }

  async save(config: Omit<TaxConfig, 'id' | 'lastModified' | 'modifiedBy' | 'isActive'>): Promise<TaxConfig> {
    const saved = await this.tauri.invoke<TaxConfig>('save_config', { config });
    this._active.set(saved);
    return saved;
  }

  async exportJson(id: string): Promise<string> {
    return this.tauri.invoke<string>('export_config_json', { id });
  }

  async importJson(json: string): Promise<TaxConfig> {
    const imported = await this.tauri.invoke<TaxConfig>('import_config_json', { json });
    this._active.set(imported);
    return imported;
  }
}
