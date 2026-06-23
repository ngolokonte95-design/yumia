import { ConfigService } from '@nestjs/config';
import { StorageService } from '../storage.service';

// ── Mock fs + S3 SDK (hoisted) ────────────────────────────────────────────────

const writeFile = jest.fn().mockResolvedValue(undefined);
const mkdir = jest.fn().mockResolvedValue(undefined);
jest.mock('node:fs/promises', () => ({
  writeFile: (...a: unknown[]) => writeFile(...a),
  mkdir: (...a: unknown[]) => mkdir(...a),
}));

jest.mock('node:crypto', () => ({
  randomUUID: () => 'fixed-uuid',
}));

const uploadDone = jest.fn().mockResolvedValue(undefined);
const UploadMock = jest.fn().mockImplementation(function (this: { done: jest.Mock }) {
  this.done = uploadDone;
});
jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: function (cfg: unknown) {
    return new (UploadMock as unknown as new (c: unknown) => unknown)(cfg);
  },
}));
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ _tag: 's3client' })),
}));

// ── Config factory ────────────────────────────────────────────────────────────

const diskConfig = {
  provider: 'disk' as const,
  s3Bucket: 'yumia-assets',
  s3Region: 'eu-west-3',
  s3AccessKeyId: '',
  s3SecretAccessKey: '',
  publicBaseUrl: 'http://localhost:4000',
};

const s3Config = {
  provider: 's3' as const,
  s3Bucket: 'yumia-prod',
  s3Region: 'eu-west-3',
  s3AccessKeyId: 'AKIA',
  s3SecretAccessKey: 'secret',
  publicBaseUrl: 'https://cdn.yumia.app',
};

function makeService(storageCfg: typeof diskConfig | typeof s3Config): StorageService {
  const config = {
    get: jest.fn((key: string) => (key === 'storage' ? storageCfg : undefined)),
  } as unknown as ConfigService;
  return new StorageService(config);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StorageService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('disk provider', () => {
    it('écrit le fichier sur disque et retourne l\'URL publique', async () => {
      const service = makeService(diskConfig);
      const url = await service.save(Buffer.from('img'), 'photo.JPG', 'places');

      expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('places'), { recursive: true });
      expect(writeFile).toHaveBeenCalled();
      expect(url).toBe('http://localhost:4000/uploads/places/fixed-uuid.jpg');
    });

    it('normalise l\'extension en minuscules', async () => {
      const service = makeService(diskConfig);
      const url = await service.save(Buffer.from('img'), 'IMG.PNG', 'avatars');

      expect(url).toBe('http://localhost:4000/uploads/avatars/fixed-uuid.png');
    });

    it('utilise .bin quand le fichier n\'a pas d\'extension', async () => {
      const service = makeService(diskConfig);
      const url = await service.save(Buffer.from('x'), 'noext', 'misc');

      expect(url).toBe('http://localhost:4000/uploads/misc/fixed-uuid.bin');
    });
  });

  describe('s3 provider', () => {
    it('upload vers S3 et retourne l\'URL CDN configurée', async () => {
      const service = makeService(s3Config);
      const url = await service.save(Buffer.from('img'), 'photo.jpg', 'places');

      expect(UploadMock).toHaveBeenCalledTimes(1);
      expect(uploadDone).toHaveBeenCalledTimes(1);
      expect(url).toBe('https://cdn.yumia.app/places/fixed-uuid.jpg');
    });

    it('passe le bon ContentType (image/jpeg) à l\'upload S3', async () => {
      const service = makeService(s3Config);
      await service.save(Buffer.from('img'), 'photo.jpeg', 'places');

      const uploadArg = UploadMock.mock.calls[0][0] as { params: { ContentType: string; ACL: string } };
      expect(uploadArg.params.ContentType).toBe('image/jpeg');
      expect(uploadArg.params.ACL).toBe('public-read');
    });

    it('utilise image/webp pour un .webp', async () => {
      const service = makeService(s3Config);
      await service.save(Buffer.from('img'), 'photo.webp', 'places');

      const uploadArg = UploadMock.mock.calls[0][0] as { params: { ContentType: string } };
      expect(uploadArg.params.ContentType).toBe('image/webp');
    });

    it('retombe sur l\'URL S3 régionale quand publicBaseUrl est localhost', async () => {
      const service = makeService({ ...s3Config, publicBaseUrl: 'http://localhost:4000' });
      const url = await service.save(Buffer.from('img'), 'photo.jpg', 'places');

      expect(url).toBe('https://yumia-prod.s3.eu-west-3.amazonaws.com/places/fixed-uuid.jpg');
    });

    it('octet-stream pour une extension inconnue', async () => {
      const service = makeService(s3Config);
      await service.save(Buffer.from('x'), 'file.xyz', 'misc');

      const uploadArg = UploadMock.mock.calls[0][0] as { params: { ContentType: string } };
      expect(uploadArg.params.ContentType).toBe('application/octet-stream');
    });
  });
});
