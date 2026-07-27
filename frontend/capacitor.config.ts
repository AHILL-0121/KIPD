import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kipd.android',
  appName: 'KipdAndroid',
  webDir: 'public', // Points to the static public folder for the shell
  server: {
    url: 'https://sa-kipd.vercel.app/', // Points to Vercel Production
    cleartext: true
  }
};

export default config;
