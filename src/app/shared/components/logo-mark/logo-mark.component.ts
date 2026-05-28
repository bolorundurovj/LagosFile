import { Component, computed, input } from '@angular/core';

export type LogoMarkVariant = 'alt-fills' | 'single-span';

/**
 * LagosFile brand mark — renders the correct SVG asset based on variant + dark mode.
 *
 * All mark geometry lives in src/assets/logo/. This component is a thin
 * wrapper that resolves the right file and sizes the img element.
 *
 * Usage:
 *   <lf-logo-mark />                              <!-- 64px wide, light, alt-fills -->
 *   <lf-logo-mark [size]="32" [dark]="true" />
 *   <lf-logo-mark variant="single-span" [size]="48" />
 */
@Component({
  selector: 'lf-logo-mark',
  standalone: true,
  template: `
    <img
      [src]="src()"
      [attr.width]="size()"
      [attr.height]="height()"
      alt="LagosFile mark"
      draggable="false"
    />
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
    }
    img {
      display: block;
      /* Preserve crispness at small sizes */
      image-rendering: -webkit-optimize-contrast;
      image-rendering: crisp-edges;
    }
  `],
})
export class LogoMarkComponent {
  readonly variant = input<LogoMarkVariant>('alt-fills');
  readonly size    = input<number>(64);
  readonly dark    = input<boolean>(false);

  /** SVG asset path resolved from variant + dark inputs. */
  protected readonly src = computed(() => {
    const v = this.variant();
    const d = this.dark();
    if (v === 'single-span') {
      return d
        ? 'assets/logo/mark-single-span-dark.svg'
        : 'assets/logo/mark-single-span.svg';
    }
    return d
      ? 'assets/logo/mark-alt-fills-dark.svg'
      : 'assets/logo/mark-alt-fills.svg';
  });

  /**
   * SVGs have a 200×100 viewBox but the arches occupy the bottom ~60px of it,
   * so the rendered height is 30% of the requested width — matching the brand
   * sheet's sizing formula: height = size * 60 / 200.
   */
  protected readonly height = computed(() => Math.round(this.size() * 0.3));
}
