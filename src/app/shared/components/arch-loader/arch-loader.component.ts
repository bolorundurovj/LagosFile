import { Component, input } from '@angular/core';

/**
 * Animated arch loader — three bridge arches pulse in sequence,
 * matching the brand mark animation from the design spec.
 *
 * Usage:
 *   <lf-arch-loader />
 *   <lf-arch-loader caption="Computing your tax..." />
 *   <lf-arch-loader [showCaption]="false" />
 */
@Component({
  selector: 'lf-arch-loader',
  standalone: true,
  template: `
    <div class="arch-loader">
      <svg width="176" height="64" viewBox="0 0 220 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- arch 1 — blue, delay 0s -->
        <g class="arch arch--1">
          <path d="M14 64 Q42 8 70 64 Q42 42 14 64 Z" fill="#004A99" />
        </g>
        <!-- arch 2 — navy, delay 0.18s -->
        <g class="arch arch--2">
          <path d="M80 64 Q108 0 136 64 Q108 38 80 64 Z" fill="#001E40" />
        </g>
        <!-- arch 3 — blue, delay 0.36s -->
        <g class="arch arch--3">
          <path d="M146 64 Q174 14 202 64 Q174 44 146 64 Z" fill="#004A99" />
        </g>
        <!-- baseline -->
        <rect x="0" y="66" width="220" height="6" rx="3" fill="#001E40" />
      </svg>

      @if (showCaption()) {
        <p class="arch-loader__caption">{{ caption() }}</p>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .arch-loader {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }

    @keyframes lf-arch-pulse {
      0%, 100% { transform: translateY(8px) scale(0.85); opacity: 0.45; }
      50%       { transform: translateY(0)   scale(1);    opacity: 1; }
    }

    .arch {
      transform-origin: center bottom;
      animation: lf-arch-pulse 1.05s ease-in-out infinite;
    }
    .arch--1 { animation-delay: 0s; }
    .arch--2 { animation-delay: 0.18s; }
    .arch--3 { animation-delay: 0.36s; }

    .arch-loader__caption {
      font-family: 'Geist Mono', 'Courier New', monospace;
      font-size: 10px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--color-on-surface-variant, #76716A);
      margin: 0;
      text-align: center;
    }
  `],
})
export class ArchLoaderComponent {
  readonly caption     = input<string>('Loading…');
  readonly showCaption = input<boolean>(true);
}
