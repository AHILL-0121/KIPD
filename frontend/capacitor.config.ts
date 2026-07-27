import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kipd.android',
  appName: 'KipdAndroid',
  webDir: 'public', // Points to the static public folder for the shell
  bundledWebRuntime: false,
  server: {
    // url: 'https://kipd-production-url.vercel.app', // Uncomment this once deployed to point the Mobile app to the live backend!
    cleartext: true
  }
};

export default config;
