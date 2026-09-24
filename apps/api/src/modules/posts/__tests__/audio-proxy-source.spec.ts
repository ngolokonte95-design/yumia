import { previewSourceUrl } from '../posts.controller';

describe('previewSourceUrl (audio-proxy)', () => {
  it('accepte les extraits Deezer et iTunes en HTTPS', () => {
    expect(previewSourceUrl('https://cdnt-preview.dzcdn.net/api/1/1/a/b/c/0/abc.mp3?hdnea=x')).not.toBeNull();
    expect(previewSourceUrl('https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/x.m4a')).not.toBeNull();
  });

  it('refuse les adresses internes et les autres hôtes', () => {
    expect(previewSourceUrl('http://169.254.169.254/metadata/v1/user-data')).toBeNull();
    expect(previewSourceUrl('http://172.17.0.1:8000/')).toBeNull();
    expect(previewSourceUrl('https://localhost/x.mp3')).toBeNull();
    expect(previewSourceUrl('https://evil.com/dzcdn.net.mp3')).toBeNull();
    expect(previewSourceUrl('https://dzcdn.net.evil.com/x.mp3')).toBeNull();
  });

  it('refuse le HTTP, les identifiants et les ports exotiques', () => {
    expect(previewSourceUrl('http://cdnt-preview.dzcdn.net/x.mp3')).toBeNull();
    expect(previewSourceUrl('https://user:pass@cdnt-preview.dzcdn.net/x.mp3')).toBeNull();
    expect(previewSourceUrl('https://cdnt-preview.dzcdn.net:8443/x.mp3')).toBeNull();
    expect(previewSourceUrl('file:///etc/passwd')).toBeNull();
    expect(previewSourceUrl(42)).toBeNull();
  });
});
