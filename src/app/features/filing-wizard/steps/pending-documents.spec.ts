import { Document } from '../../../core/models';
import { FilingService } from '../../../core/services/filing.service';
import { DropzoneFile } from '../../../shared/components/file-dropzone/file-dropzone.component';
import { MAX_ATTACHMENT_BYTES, flushDocuments, queueDocument, removeDocument } from './pending-documents';

describe('pending-documents', () => {
  let filingService: jasmine.SpyObj<FilingService>;

  function entry(documents: Document[] = []): { id: string; documents: Document[] } {
    return { id: 'entry-1', documents };
  }

  function file(name: string, size = 1024, path = `/tmp/${name}`): DropzoneFile {
    return { path, name, size, type: name.split('.').pop()! };
  }

  beforeEach(() => {
    filingService = jasmine.createSpyObj('FilingService', ['attachDocument', 'deleteDocument']);
  });

  describe('queueDocument', () => {
    it('rejects files without a native path', () => {
      const e = entry();
      expect(queueDocument(e, file('a.pdf', 10, ''), 'income_entry')).toContain('Drag-and-drop is not supported');
      expect(e.documents).toEqual([]);
    });

    it('rejects files over the 100MB limit', () => {
      const e = entry();
      expect(queueDocument(e, file('big.pdf', MAX_ATTACHMENT_BYTES + 1), 'income_entry')).toContain('100MB');
      expect(e.documents).toEqual([]);
    });

    it('adds a temporary document to the entry straight away', () => {
      const e = entry();
      expect(queueDocument(e, file('a.pdf', MAX_ATTACHMENT_BYTES), 'relief_entry')).toBeNull();
      expect(e.documents.length).toBe(1);
      expect(e.documents[0]).toEqual(jasmine.objectContaining({
        parentEntryId: 'entry-1',
        parentEntryType: 'relief_entry',
        filePath: '/tmp/a.pdf',
        fileName: 'a.pdf',
        fileType: 'pdf',
        fileSizeBytes: MAX_ATTACHMENT_BYTES,
      }));
    });

    it('copes with an entry whose documents list is missing', () => {
      const e = { id: 'entry-1' } as { id: string; documents: Document[] };
      queueDocument(e, file('a.pdf'), 'income_entry');
      expect(e.documents.length).toBe(1);
    });
  });

  describe('flushDocuments', () => {
    it('uploads queued files and swaps temporary ids for saved ids', async () => {
      const e = entry();
      queueDocument(e, file('a.pdf', 10), 'income_entry');
      queueDocument(e, file('b.png', 20), 'income_entry');
      const tempB = e.documents[1].id;
      filingService.attachDocument.and.callFake(async (_id, _type, path) =>
        (path.endsWith('a.pdf')
          ? { id: 'db-a', filePath: '/vault/a.enc', fileSizeBytes: 999 }
          : { id: 'db-b' }) as Document);

      expect(await flushDocuments(filingService, e, 'income_entry')).toEqual([]);
      expect(filingService.attachDocument).toHaveBeenCalledWith('entry-1', 'income_entry', '/tmp/a.pdf', 'a.pdf', 'pdf', 10);
      expect(e.documents.map(d => d.id)).toEqual(['db-a', 'db-b']);
      expect(e.documents[0].filePath).toBe('/vault/a.enc');
      expect(e.documents[0].fileSizeBytes).toBe(999);
      expect(e.documents[1].filePath).toBe('/tmp/b.png');
      expect(e.documents[1].id).not.toBe(tempB);

      filingService.attachDocument.calls.reset();
      expect(await flushDocuments(filingService, e, 'income_entry')).toEqual([]);
      expect(filingService.attachDocument).not.toHaveBeenCalled();
    });

    it('leaves the temporary document when the backend returns no id', async () => {
      const e = entry();
      queueDocument(e, file('a.pdf'), 'income_entry');
      const tempId = e.documents[0].id;
      filingService.attachDocument.and.resolveTo(undefined as unknown as Document);
      await flushDocuments(filingService, e, 'income_entry');
      expect(e.documents[0].id).toBe(tempId);
    });

    it('reports failures and keeps failed files queued for a retry', async () => {
      const e = entry();
      queueDocument(e, file('a.pdf'), 'income_entry');
      queueDocument(e, file('b.pdf'), 'income_entry');
      filingService.attachDocument.and.callFake(async (_id, _type, path) => {
        if (path.endsWith('b.pdf')) throw 'disk full';
        return { id: 'db-a' } as Document;
      });

      expect(await flushDocuments(filingService, e, 'income_entry')).toEqual(['b.pdf: disk full']);

      filingService.attachDocument.calls.reset();
      filingService.attachDocument.and.resolveTo({ id: 'db-b' } as Document);
      expect(await flushDocuments(filingService, e, 'income_entry')).toEqual([]);
      expect(filingService.attachDocument).toHaveBeenCalledTimes(1);
      expect(e.documents.map(d => d.id)).toEqual(['db-a', 'db-b']);
    });

    it('does nothing for an entry with no queued files', async () => {
      expect(await flushDocuments(filingService, entry(), 'income_entry')).toEqual([]);
      expect(filingService.attachDocument).not.toHaveBeenCalled();
    });
  });

  describe('removeDocument', () => {
    it('drops a queued file locally without calling the backend', async () => {
      const e = entry();
      queueDocument(e, file('a.pdf'), 'income_entry');
      queueDocument(e, file('b.pdf'), 'income_entry');
      const [a, b] = e.documents.map(d => d.id);

      expect(await removeDocument(filingService, e, a)).toBeNull();
      expect(e.documents.map(d => d.id)).toEqual([b]);
      expect(await removeDocument(filingService, e, b)).toBeNull();
      expect(e.documents).toEqual([]);
      expect(filingService.deleteDocument).not.toHaveBeenCalled();

      filingService.attachDocument.and.resolveTo({ id: 'x' } as Document);
      await flushDocuments(filingService, e, 'income_entry');
      expect(filingService.attachDocument).not.toHaveBeenCalled();
    });

    it('deletes saved documents from the backend', async () => {
      const saved = { id: 'db-1' } as Document;
      const e = entry([saved, { id: 'db-2' } as Document]);
      filingService.deleteDocument.and.resolveTo();
      expect(await removeDocument(filingService, e, 'db-1')).toBeNull();
      expect(filingService.deleteDocument).toHaveBeenCalledWith('db-1');
      expect(e.documents.map(d => d.id)).toEqual(['db-2']);
    });

    it('returns the error and keeps the document when deletion fails', async () => {
      const e = entry([{ id: 'db-1' } as Document]);
      filingService.deleteDocument.and.rejectWith('locked');
      expect(await removeDocument(filingService, e, 'db-1')).toBe('locked');
      expect(e.documents.length).toBe(1);
    });
  });
});
