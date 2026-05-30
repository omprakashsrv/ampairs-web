import {Component, inject} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {ThemeService} from './core/services/theme.service';
import {LanguageService} from './core/services/language.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <router-outlet></router-outlet>`,
  styles: []
})
export class AppComponent {
  title = 'ampairs-web';

  // Eagerly initialise theme and language so they are applied before any
  // component renders (both run their setup in their constructors).
  private readonly themeService = inject(ThemeService);
  private readonly languageService = inject(LanguageService);
}
