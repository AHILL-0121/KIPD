import { NextResponse } from 'next/server';
import { getPlatformAnnouncement } from '@/lib/platform-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const announcement = await getPlatformAnnouncement();
  return NextResponse.json(announcement);
}
