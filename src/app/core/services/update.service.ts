import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import pkg from '../../../../package.json';

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  prerelease: boolean;
}

@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly currentVersion = pkg.version;
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
      const release = await this.http.get<GitHubRelease>(this.releasesUrl).toPromise();
      if (!release) return;
      const latest = release.tag_name.replace(/^v/, '');
      if (this.isNewer(latest, this.currentVersion)) {
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
    const la = latest.split('.').map(Number);
    const cu = current.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((la[i] ?? 0) > (cu[i] ?? 0)) return true;
      if ((la[i] ?? 0) < (cu[i] ?? 0)) return false;
    }
    return false;
  }
}