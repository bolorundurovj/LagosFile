import { Document } from '../../../core/models';
import { FilingService } from '../../../core/services/filing.service';
import { DropzoneFile } from '../../../shared/components/file-dropzone/file-dropzone.component';

export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

type ParentType = Document['parentEntryType'];

interface WithDocuments {
  id: string;
  documents: Document[];
}

interface PendingDoc {
  tempId: string;
  file: DropzoneFile;
}

const pending = new WeakMap<object, PendingDoc[]>();

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
  const tempId = crypto.randomUUID();
  pending.set(entry, [...(pending.get(entry) ?? []), { tempId, file }]);
  entry.documents = [...(entry.documents ?? []), {
    id: tempId,
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

/**
 * Uploads queued files for a saved entry and replaces each temporary client id
 * with the real database id returned by `attach_document`.
 * Returns the names of files that failed.
 */
export async function flushDocuments(
  filingService: FilingService,
  entry: WithDocuments,
  parentType: ParentType,
): Promise<string[]> {
  const failed: string[] = [];
  const stillPending: PendingDoc[] = [];
  for (const item of pending.get(entry) ?? []) {
    try {
      const saved = await filingService.attachDocument(
        entry.id,
        parentType,
        item.file.path,
        item.file.name,
        item.file.type,
        item.file.size,
      );
      if (saved?.id) {
        entry.documents = (entry.documents ?? []).map(d =>
          d.id === item.tempId
            ? {
                ...d,
                id: saved.id,
                filePath: saved.filePath ?? d.filePath,
                fileSizeBytes: saved.fileSizeBytes ?? d.fileSizeBytes,
              }
            : d,
        );
      }
    } catch (err) {
      failed.push(`${item.file.name}: ${err}`);
      stillPending.push(item);
    }
  }
  if (stillPending.length > 0) {
    pending.set(entry, stillPending);
  } else {
    pending.delete(entry);
  }
  return failed;
}

/**
 * Removes an attachment from an entry. If it was only queued locally (not yet
 * uploaded), drops it from the pending queue; otherwise deletes it from the
 * backend database and encrypted document store.
 */
export async function removeDocument(
  filingService: FilingService,
  entry: WithDocuments,
  docId: string,
): Promise<string | null> {
  const queued = pending.get(entry) ?? [];
  const isQueued = queued.some(q => q.tempId === docId);
  if (isQueued) {
    const remaining = queued.filter(q => q.tempId !== docId);
    if (remaining.length > 0) pending.set(entry, remaining);
    else pending.delete(entry);
    entry.documents = (entry.documents ?? []).filter(d => d.id !== docId);
    return null;
  }
  try {
    await filingService.deleteDocument(docId);
    entry.documents = (entry.documents ?? []).filter(d => d.id !== docId);
    return null;
  } catch (err) {
    return String(err);
  }
}
