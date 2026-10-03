import { Document } from '../../../core/models';
import { FilingService } from '../../../core/services/filing.service';
import { DropzoneFile } from '../../../shared/components/file-dropzone/file-dropzone.component';

export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

type ParentType = Document['parentEntryType'];

interface WithDocuments {
  id: string;
  documents: Document[];
}

const pending = new WeakMap<object, DropzoneFile[]>();

/**
 * Queues a picked file against an entry and shows it in the UI straight away.
 * Returns an error message when the file cannot be attached.
 */
export function queueDocument(entry: WithDocuments, file: DropzoneFile, parentType: ParentType): string | null {
  if (!file.path) {
    return 'Drag-and-drop is not supported here. Click the drop zone to pick a file.';
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return 'File exceeds the 100MB limit. Please attach a smaller file.';
  }
  pending.set(entry, [...(pending.get(entry) ?? []), file]);
  entry.documents = [...(entry.documents ?? []), {
    id: crypto.randomUUID(),
    parentEntryId: entry.id,
    parentEntryType: parentType,
    filePath: file.path,
    fileName: file.name,
    fileType: file.type,
    fileSizeBytes: file.size,
    uploadedAt: new Date().toISOString(),
  }];
  return null;
}

/** Uploads queued files for a saved entry. Returns the names of files that failed. */
export async function flushDocuments(
  filingService: FilingService,
  entry: WithDocuments,
  parentType: ParentType,
): Promise<string[]> {
  const failed: string[] = [];
  for (const doc of pending.get(entry) ?? []) {
    try {
      await filingService.attachDocument(entry.id, parentType, doc.path, doc.name, doc.type, doc.size);
    } catch (err) {
      failed.push(`${doc.name}: ${err}`);
    }
  }
  pending.delete(entry);
  return failed;
}
