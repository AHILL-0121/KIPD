import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kipd.android',
  appName: 'KipdAndroid',
  webDir: 'public',
  server: {
    url: 'https://sa-kipd.vercel.app/',
    cleartext: true
  },
  plugins: {
    CapacitorCookies: {
      enabled: true
    },
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
