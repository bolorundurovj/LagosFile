import { Component, ElementRef, NgZone, OnDestroy, OnInit, inject, output, input } from '@angular/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';
import { LucideAngularModule } from 'lucide-angular';

export interface DropzoneFile {
  path: string;
  name: string;
  size: number;
  type: string;
}

@Component({
  selector: 'lf-file-dropzone',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div
      class="drop-zone"
      [class.drag-over]="isDragOver"
      [class.drop-zone--compact]="compact()"
      (click)="openFilePicker()"
      (dragover)="onDragOver($event)"
      (drop)="onDrop($event)"
      role="button"
      tabindex="0"
      (keydown.enter)="openFilePicker()"
      [attr.aria-label]="label()"
    >
      <span class="drop-zone__icon"><lucide-icon name="paperclip" [size]="compact() ? 14 : 22" [strokeWidth]="1.75"></lucide-icon></span>
      <span class="drop-zone__label">{{ label() }}</span>
      <span class="drop-zone__subtext">PDF, JPG, PNG · Max 100 MB each</span>
    </div>
  `,
})
export class FileDropzoneComponent implements OnInit, OnDestroy {
  private host = inject(ElementRef<HTMLElement>);
  private zone = inject(NgZone);
  private unlisten?: () => void;

  label = input('Attach supporting document');
  compact = input(false);
  fileSelected = output<DropzoneFile>();

  isDragOver = false;

  async openFilePicker(): Promise<void> {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Documents', extensions: ['pdf', 'jpg', 'jpeg', 'png'] }],
      });
      if (selected && typeof selected === 'string') {
        const name = selected.split(/[\\/]/).pop() ?? selected;
        const ext = name.split('.').pop()?.toLowerCase() ?? '';
        this.fileSelected.emit({ path: selected, name, size: 0, type: ext });
      }
    } catch { /* user cancelled */ }
  }

  /**
   * The webview swallows HTML5 drops and reports native file paths through
   * Tauri instead, so drops are matched to this zone by cursor position.
   */
  async ngOnInit(): Promise<void> {
    try {
      this.unlisten = await getCurrentWebview().onDragDropEvent(({ payload }) => this.zone.run(() => {
        if (payload.type === 'leave') {
          this.isDragOver = false;
          return;
        }
        const inside = this.contains(payload.position.x, payload.position.y);
        if (payload.type === 'over' || payload.type === 'enter') {
          this.isDragOver = inside;
        } else if (payload.type === 'drop') {
          this.isDragOver = false;
          if (inside) payload.paths.forEach(p => this.emitPath(p));
        }
      }));
    } catch { /* not running inside Tauri */ }
  }

  ngOnDestroy(): void {
    this.unlisten?.();
  }

  onDragOver(e: DragEvent): void {
    e.preventDefault();
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
  }

  private contains(physicalX: number, physicalY: number): boolean {
    const scale = window.devicePixelRatio || 1;
    const x = physicalX / scale;
    const y = physicalY / scale;
    const r = (this.host.nativeElement as HTMLElement).getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  private emitPath(path: string): void {
    const name = path.split(/[\\/]/).pop() ?? path;
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (!['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) return;
    this.fileSelected.emit({ path, name, size: 0, type: ext });
  }
}
