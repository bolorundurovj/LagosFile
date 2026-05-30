import { TestBed } from '@angular/core/testing';
import { DocumentService } from './document.service';
import { TauriService } from './tauri.service';

describe('DocumentService', () => {
  let service: DocumentService;
  let tauriSpy: jasmine.SpyObj<TauriService>;

  beforeEach(() => {
    const spy = jasmine.createSpyObj('TauriService', ['invoke']);

    TestBed.configureTestingModule({
      providers: [
        DocumentService,
        { provide: TauriService, useValue: spy }
      ]
    });

    service = TestBed.inject(DocumentService);
    tauriSpy = TestBed.inject(TauriService) as jasmine.SpyObj<TauriService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('formatSize', () => {
    it('should format bytes correctly', () => {
      expect(service.formatSize(500)).toBe('500 B');
      expect(service.formatSize(1024)).toBe('1.0 KB');
      expect(service.formatSize(1024 * 1024)).toBe('1.0 MB');
    });
  });

  describe('attachDocument', () => {
    it('should throw error if file is too large', async () => {
      const huge = 200 * 1024 * 1024;
      await expectAsync(service.attachDocument('id', 'income_entry', 'p', 'n', 't', huge))
        .toBeRejectedWithError(/exceeds the 100MB limit/);
    });

    it('should invoke tauri attach_document', async () => {
      tauriSpy.invoke.and.resolveTo({ id: 'doc-1' } as any);
      const result = await service.attachDocument('id', 'income_entry', 'p', 'n', 't', 100);
      expect(tauriSpy.invoke).toHaveBeenCalledWith('attach_document', jasmine.any(Object));
      expect(result.id).toBe('doc-1');
    });
  });

  it('should list documents', async () => {
    tauriSpy.invoke.and.resolveTo([]);
    await service.listDocuments('id');
    expect(tauriSpy.invoke).toHaveBeenCalledWith('list_documents', { parentEntryId: 'id' });
  });

  it('should delete document', async () => {
    tauriSpy.invoke.and.resolveTo();
    await service.deleteDocument('id');
    expect(tauriSpy.invoke).toHaveBeenCalledWith('delete_document', { id: 'id' });
  });
});
