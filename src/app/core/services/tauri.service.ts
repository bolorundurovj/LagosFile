import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';

/**
 * Thin wrapper around Tauri's invoke() so all command calls are
 * testable via substitution and typed in one place.
 */
@Injectable({ providedIn: 'root' })
export class TauriService {
  async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    return invoke<T>(command, args);
  }
}
