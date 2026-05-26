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
  Paperclip, Trash2, Sun, Moon, Monitor,
} from 'lucide-angular';

function initApp(auth: AuthService, config: ConfigService, theme: ThemeService) {
  return async () => {
    await auth.init();
    void theme; // ThemeService self-initialises via its constructor
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
        Paperclip, Trash2, Sun, Moon, Monitor,
      }),
    },
  ],
};
