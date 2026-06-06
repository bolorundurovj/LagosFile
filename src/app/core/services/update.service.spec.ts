import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { UpdateService } from './update.service';

describe('UpdateService', () => {
  let service: UpdateService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [UpdateService],
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(UpdateService);
    httpMock = TestBed.inject(HttpTestingController);
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should detect a newer version', async () => {
    service.checkForUpdates();
    const req = httpMock.expectOne('https://api.github.com/repos/bolorundurovj/LagosFile/releases/latest');
    req.flush({ tag_name: 'v99.0.0', html_url: 'https://github.com/bolorundurovj/LagosFile/releases/tag/v99.0.0', prerelease: false });

    await new Promise(r => setTimeout(r, 0));
    expect(service.updateAvailable()).toBe('99.0.0');
    expect(service.updateUrl()).toBe('https://github.com/bolorundurovj/LagosFile/releases/tag/v99.0.0');
  });

  it('should not flag when current version is latest', async () => {
    service.checkForUpdates();
    const req = httpMock.expectOne('https://api.github.com/repos/bolorundurovj/LagosFile/releases/latest');
    req.flush({ tag_name: 'v0.0.1', html_url: 'https://github.com/bolorundurovj/LagosFile/releases/tag/v0.0.1', prerelease: false });

    await new Promise(r => setTimeout(r, 0));
    expect(service.updateAvailable()).toBeNull();
  });

  it('should not show banner for dismissed version', async () => {
    localStorage.setItem('lagosfile-update-dismissed', '99.0.0');
    service.checkForUpdates();
    const req = httpMock.expectOne('https://api.github.com/repos/bolorundurovj/LagosFile/releases/latest');
    req.flush({ tag_name: 'v99.0.0', html_url: 'https://github.com/bolorundurovj/LagosFile/releases/tag/v99.0.0', prerelease: false });

    await new Promise(r => setTimeout(r, 0));
    expect(service.updateAvailable()).toBeNull();
  });

  it('dismiss should clear the signal and store version', () => {
    service.updateAvailable.set('99.0.0');
    service.dismiss('99.0.0');
    expect(service.updateAvailable()).toBeNull();
    expect(localStorage.getItem('lagosfile-update-dismissed')).toBe('99.0.0');
  });

  it('should handle network errors gracefully', async () => {
    service.checkForUpdates();
    const req = httpMock.expectOne('https://api.github.com/repos/bolorundurovj/LagosFile/releases/latest');
    req.error(new ProgressEvent('error'));

    await new Promise(r => setTimeout(r, 0));
    expect(service.updateAvailable()).toBeNull();
  });
});