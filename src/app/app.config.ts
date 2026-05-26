import { ApplicationConfig, provideZoneChangeDetection, APP_INITIALIZER } from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';
import { routes } from './app.routes';
import { AuthService } from './core/services/auth.service';
import { ConfigService } from './core/services/config.service';
import { LUCIDE_ICONS, LucideIconProvider } from 'lucide-angular';
import {
  AlertTriangle, Check, CheckCircle, Clock, Info, Lock, Key, Folder,
  FileText, FilePlus2, Calculator, BookOpen, ClipboardList,
  LayoutDashboard, History, Settings2, SlidersHorizontal,
  Paperclip, Trash2,
} from 'lucide-angular';

function initApp(auth: AuthService, config: ConfigService) {
  return async () => {
    await auth.init();
    // Config loads after unlock — handled lazily
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withViewTransitions()),
    {
      provide: APP_INITIALIZER,
      useFactory: initApp,
      deps: [AuthService, ConfigService],
      multi: true,
    },
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({
        AlertTriangle, Check, CheckCircle, Clock, Info, Lock, Key, Folder,
        FileText, FilePlus2, Calculator, BookOpen, ClipboardList,
        LayoutDashboard, History, Settings2, SlidersHorizontal,
        Paperclip, Trash2,
      }),
    },
  ],
};
