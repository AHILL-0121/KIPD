import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface AndroidVersionPayload {
  versionCode: number;
  versionName: string;
  downloadUrl: string;
  releaseNotes?: string;
}

const CACHE_TTL_MS = 5 * 60_000;
const g = globalThis as unknown as {
  __kipdAndroidVersion?: { data: AndroidVersionPayload; expiresAt: number };
};

export async function GET() {
  const envCode = Number.parseInt(process.env.ANDROID_LATEST_VERSION_CODE || '', 10);
  if (Number.isFinite(envCode) && envCode > 0) {
    return NextResponse.json({
      versionCode: envCode,
      versionName: process.env.ANDROID_LATEST_VERSION_NAME || `1.0.${envCode}`,
      downloadUrl:
        process.env.ANDROID_DOWNLOAD_URL ||
        'https://github.com/AHILL-0121/KIPD/releases/latest',
    } satisfies AndroidVersionPayload);
  }

  if (g.__kipdAndroidVersion && g.__kipdAndroidVersion.expiresAt > Date.now()) {
    return NextResponse.json(g.__kipdAndroidVersion.data);
  }

  const fallback: AndroidVersionPayload = {
    versionCode: 1,
    versionName: '1.0.0',
    downloadUrl: 'https://github.com/AHILL-0121/KIPD/releases/latest',
  };

  try {
    const res = await fetch('https://api.github.com/repos/AHILL-0121/KIPD/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    });
    if (!res.ok) return NextResponse.json(fallback);

    const release = (await res.json()) as {
      tag_name?: string;
      html_url?: string;
      body?: string;
      assets?: Array<{ name?: string; browser_download_url?: string }>;
    };
    const match = release.tag_name?.match(/android-v\d+\.\d+\.(\d+)/i);
    const versionCode = match ? Number.parseInt(match[1], 10) : 1;
    const apkAsset = release.assets?.find((a) => a.name?.endsWith('.apk'));

    const payload: AndroidVersionPayload = {
      versionCode,
      versionName: release.tag_name?.replace(/^android-v/i, '') || `1.0.${versionCode}`,
      downloadUrl: apkAsset?.browser_download_url || release.html_url || fallback.downloadUrl,
      releaseNotes: release.body?.slice(0, 200),
    };
    g.__kipdAndroidVersion = { data: payload, expiresAt: Date.now() + CACHE_TTL_MS };
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(fallback);
  }
}
