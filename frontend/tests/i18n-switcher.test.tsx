// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { I18nProvider } from '@/components/ui/i18n-provider';
import DashboardLayout from '@/app/dashboard/layout';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/finance', useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@clerk/nextjs', () => ({ UserButton: () => null, useClerk: () => ({ signOut: vi.fn() }) }));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ id: 't1', name: 'SA STAY INN', type: 'both', role: 'owner', userName: 'Owner' }))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('live multi-language switcher (EN/HI/TA/TE/ML/KN)', () => {
  it('switches sidebar navigation, area headings, breadcrumbs, and actions across all 6 languages', async () => {
    render(
      <I18nProvider>
        <DashboardLayout>
          <p>child</p>
        </DashboardLayout>
      </I18nProvider>,
    );

    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByText('Finance')).toBeTruthy();
    expect(within(nav).getByText('Orders')).toBeTruthy();
    expect(screen.getByText('Collapse')).toBeTruthy();

    const switchTo = (code: string) => {
      const selects = screen.getAllByRole('combobox', { name: 'Language' });
      fireEvent.change(selects[0], { target: { value: code } });
    };

    // Hindi
    switchTo('hi');
    expect(within(nav).getByText('वित्त')).toBeTruthy();
    expect(within(nav).getByText('ऑर्डर')).toBeTruthy();
    expect(within(nav).getByText('मेनू')).toBeTruthy();
    expect(screen.getByText('छोटा करें')).toBeTruthy();
    expect(localStorage.getItem('kipd-locale')).toBe('hi');

    // Tamil
    switchTo('ta');
    expect(within(nav).getByText('நிதி')).toBeTruthy();
    expect(within(nav).getByText('ஆர்டர்கள்')).toBeTruthy();
    expect(within(nav).getByText('மெனு')).toBeTruthy();
    expect(screen.getByText('சுருக்கு')).toBeTruthy();
    expect(localStorage.getItem('kipd-locale')).toBe('ta');

    // Telugu
    switchTo('te');
    expect(within(nav).getByText('ఫైనాన్స్')).toBeTruthy();
    expect(within(nav).getByText('ఆర్డర్లు')).toBeTruthy();
    expect(within(nav).getByText('మెను')).toBeTruthy();
    expect(screen.getByText('కుదించు')).toBeTruthy();
    expect(localStorage.getItem('kipd-locale')).toBe('te');

    // Malayalam
    switchTo('ml');
    expect(within(nav).getByText('സാമ്പത്തികം')).toBeTruthy();
    expect(within(nav).getByText('ഓർഡറുകൾ')).toBeTruthy();
    expect(within(nav).getByText('മെനു')).toBeTruthy();
    expect(screen.getByText('ചുരുക്കുക')).toBeTruthy();
    expect(localStorage.getItem('kipd-locale')).toBe('ml');

    // Kannada
    switchTo('kn');
    expect(within(nav).getByText('ಹಣಕಾಸು')).toBeTruthy();
    expect(within(nav).getByText('ಆರ್ಡರ್‌ಗಳು')).toBeTruthy();
    expect(within(nav).getByText('ಮೆನು')).toBeTruthy();
    expect(screen.getByText('ಕುಗ್ಗಿಸು')).toBeTruthy();
    expect(localStorage.getItem('kipd-locale')).toBe('kn');

    // Switch back to English
    switchTo('en');
    expect(within(nav).getByText('Finance')).toBeTruthy();
    expect(localStorage.getItem('kipd-locale')).toBe('en');
  });
});
