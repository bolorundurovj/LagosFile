import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'lf-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
    }
  `],
})
export class AppComponent {}
