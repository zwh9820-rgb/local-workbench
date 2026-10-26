'use server';

import { revalidatePath } from 'next/cache';
import { readSettings, writeSettings, type AppSettings } from '@/server/settings';

export async function saveAppSettings(raw: unknown): Promise<AppSettings> {
  const next = writeSettings(raw);
  revalidatePath('/settings');
  return next;
}

export async function loadAppSettings(): Promise<AppSettings> {
  return readSettings();
}
