import { Injectable } from '@angular/core';
import { TauriService } from './tauri.service';
import { Document as LfDocument } from '../models';

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB

@Injectable({ providedIn: 'root' })
export class DocumentService {
  constructor(private tauri: TauriService) {}

  async attachDocument(
    parentEntryId: string,
    parentEntryType: LfDocument['parentEntryType'],
    filePath: string,
    fileName: string,
    fileType: string,
    fileSizeBytes: number,
  ): Promise<LfDocument> {
    if (fileSizeBytes > MAX_FILE_BYTES) {
      throw new Error('File exceeds the 100MB limit. Please attach a smaller file.');
    }
    return this.tauri.invoke<LfDocument>('attach_document', {
      parentEntryId, parentEntryType, filePath, fileName, fileType, fileSizeBytes,
    });
  }

  async listDocuments(parentEntryId: string): Promise<LfDocument[]> {
    return this.tauri.invoke<LfDocument[]>('list_documents', { parentEntryId });
  }

  async deleteDocument(id: string): Promise<void> {
    return this.tauri.invoke('delete_document', { id });
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
