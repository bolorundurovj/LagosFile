import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import pkg from '../../../../package.json';

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  prerelease: boolean;
}

@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly releasesUrl = 'https://api.github.com/repos/bolorundurovj/LagosFile/releases/latest';
  private dismissedKey = 'lagosfile-update-dismissed';

  updateAvailable = signal<string | null>(null);
  updateUrl = signal<string | null>(null);
  checking = signal(false);

  constructor(private http: HttpClient) {}

  async checkForUpdates(): Promise<void> {
    const dismissed = localStorage.getItem(this.dismissedKey);
    this.checking.set(true);
    try {
      const release = await firstValueFrom(this.http.get<GitHubRelease>(this.releasesUrl));
      if (!release) return;
      const latest = release.tag_name.replace(/^v/, '');
      if (this.isNewer(latest, pkg.version)) {
        if (dismissed === latest) return;
        this.updateAvailable.set(latest);
        this.updateUrl.set(release.html_url);
      }
    } catch {
      this.updateAvailable.set(null);
    } finally {
      this.checking.set(false);
    }
  }

  dismiss(version: string): void {
    localStorage.setItem(this.dismissedKey, version);
    this.updateAvailable.set(null);
  }

  private isNewer(latest: string, current: string): boolean {
    const parse = (v: string) => {
      const [numeric, pre] = v.split('-', 2);
      const parts = numeric.split('.').map(n => parseInt(n, 10) || 0);
      return { parts, pre: pre ?? null };
    };
    const l = parse(latest);
    const c = parse(current);
    for (let i = 0; i < 3; i++) {
      if ((l.parts[i] ?? 0) > (c.parts[i] ?? 0)) return true;
      if ((l.parts[i] ?? 0) < (c.parts[i] ?? 0)) return false;
    }
    return l.pre === null && c.pre !== null;
  }
}