/**
 * Choix du motif de signalement : les CINQ motifs + Annuler doivent être
 * proposés sur les deux plateformes (Alert.alert n'en montrait que trois sur
 * Android).
 */
const mockPlatform = { OS: 'android' as 'android' | 'ios' };
const mockActionSheet = jest.fn();
const mockAlert = jest.fn();

jest.mock(
  'react-native',
  () => ({
    Platform: mockPlatform,
    ActionSheetIOS: { showActionSheetWithOptions: (...args: unknown[]) => mockActionSheet(...args) },
    Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
  }),
  { virtual: true },
);

import { promptReport, subscribeReportPicker, type ReportPickerRequest } from '../report-content';

const t = (key: string) => `t:${key}`;

describe('promptReport', () => {
  const realFetch = global.fetch;
  let fetchSpy: jest.Mock;

  beforeEach(() => {
    mockActionSheet.mockReset();
    mockAlert.mockReset();
    fetchSpy = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchSpy as never;
  });
  afterEach(() => { global.fetch = realFetch; });

  it('Android : passe les 5 motifs à la feuille, puis envoie le motif choisi', () => {
    mockPlatform.OS = 'android';
    let req: ReportPickerRequest | null = null;
    const unsubscribe = subscribeReportPicker((r) => { req = r; });

    promptReport({ accessToken: 'tok', targetType: 'meetup', targetId: 'e1', t, titleKey: 'report_meetup_title' });

    expect(mockAlert).not.toHaveBeenCalled();
    const shown = req as unknown as ReportPickerRequest;
    expect(shown.title).toBe('t:report_meetup_title');
    expect(shown.reasons).toHaveLength(5);
    expect(shown.cancelLabel).toBe('t:up_cancel');

    shown.onPick(2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as { body: string }).body);
    expect(body).toEqual({ targetType: 'meetup', targetId: 'e1', reason: 't:up_report_harassment' });
    expect(mockAlert).toHaveBeenCalledWith('t:up_report_thanks_title', 't:up_report_thanks_body');
    unsubscribe();
  });

  it('iOS : feuille native avec 5 motifs + Annuler ; annuler n\'envoie rien', () => {
    mockPlatform.OS = 'ios';
    promptReport({ accessToken: 'tok', targetType: 'message', targetId: 'm1', t, details: 'texte lu' });

    const [options, callback] = mockActionSheet.mock.calls[0] as [
      { options: string[]; cancelButtonIndex: number },
      (i: number) => void,
    ];
    expect(options.options).toHaveLength(6);
    expect(options.cancelButtonIndex).toBe(5);

    callback(5);
    expect(fetchSpy).not.toHaveBeenCalled();

    callback(0);
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as { body: string }).body);
    expect(body).toEqual({ targetType: 'message', targetId: 'm1', reason: 't:up_report_spam', details: 'texte lu' });
  });

  it('sans feuille montée sur Android, retombe sur Alert.alert', () => {
    mockPlatform.OS = 'android';
    promptReport({ accessToken: 'tok', targetType: 'post', targetId: 'p1', t });
    expect(mockAlert).toHaveBeenCalledTimes(1);
  });

  it('ne fait rien sans session', () => {
    promptReport({ accessToken: null, targetType: 'post', targetId: 'p1', t });
    expect(mockAlert).not.toHaveBeenCalled();
    expect(mockActionSheet).not.toHaveBeenCalled();
  });
});
