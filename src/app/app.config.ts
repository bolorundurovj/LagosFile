import { ApplicationConfig, provideZoneChangeDetection, APP_INITIALIZER } from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';
import { routes } from './app.routes';
import { AuthService } from './core/services/auth.service';
import { ConfigService } from './core/services/config.service';
import { ThemeService } from './core/services/theme.service';
import { LUCIDE_ICONS, LucideIconProvider } from 'lucide-angular';
import {
  AlertTriangle, Check, CheckCircle, Clock, Info, Lock, Key, Folder,
  FileText, FilePlus2, Calculator, BookOpen, ClipboardList,
  LayoutDashboard, History, Settings2, SlidersHorizontal,
  Paperclip, Trash2, Sun, Moon, Monitor, Send, MoreVertical,
} from 'lucide-angular';

const SPLASH_MIN_MS = 1800; // minimum visible duration for the splash screen

function initApp(auth: AuthService, config: ConfigService, theme: ThemeService) {
  return async () => {
    void theme; // ThemeService self-initialises via its constructor
    void config;
    // Run auth init and the minimum splash timer in parallel so the splash
    // is always visible for at least SPLASH_MIN_MS, even on a fast machine.
    await Promise.all([
      auth.init(),
      new Promise<void>(resolve => setTimeout(resolve, SPLASH_MIN_MS)),
    ]);
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withViewTransitions()),
    {
      provide: APP_INITIALIZER,
      useFactory: initApp,
      deps: [AuthService, ConfigService, ThemeService],
      multi: true,
    },
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({
        AlertTriangle, Check, CheckCircle, Clock, Info, Lock, Key, Folder,
        FileText, FilePlus2, Calculator, BookOpen, ClipboardList,
        LayoutDashboard, History, Settings2, SlidersHorizontal,
        Paperclip, Trash2, Sun, Moon, Monitor, Send, MoreVertical,
      }),
    },
  ],
};
