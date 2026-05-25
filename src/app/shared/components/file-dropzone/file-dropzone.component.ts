import { Component, output, input } from '@angular/core';
import { open } from '@tauri-apps/plugin-dialog';

export interface DropzoneFile {
  path: string;
  name: string;
  size: number;
  type: string;
}

@Component({
  selector: 'lf-file-dropzone',
  standalone: true,
  template: `
    <div
      class="drop-zone"
      [class.drag-over]="isDragOver"
      (click)="openFilePicker()"
      (dragover)="onDragOver($event)"
      (dragleave)="isDragOver = false"
      (drop)="onDrop($event)"
      role="button"
      tabindex="0"
      (keydown.enter)="openFilePicker()"
      [attr.aria-label]="label()"
    >
      <span class="drop-zone__icon">📎</span>
      <span class="drop-zone__label">{{ label() }}</span>
      <span class="drop-zone__subtext">PDF, JPG, PNG · Max 100 MB each</span>
    </div>
  `,
})
export class FileDropzoneComponent {
  label = input('Attach supporting document');
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
    } catch (_) { /* user cancelled */ }
  }

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    this.isDragOver = true;
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.isDragOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      this.fileSelected.emit({ path: '', name: file.name, size: file.size, type: file.type });
    }
  }
}
