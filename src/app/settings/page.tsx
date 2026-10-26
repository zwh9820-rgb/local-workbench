import { readSettings, SETTINGS_PATH } from '@/server/settings';
import { DB_PATH } from '@/db';
import { SettingsForm } from './settings-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: '设置' };

export default function SettingsPage() {
  const settings = readSettings();

  return (
    <SettingsForm
      initial={settings}
      dbPath={DB_PATH}
      settingsPath={SETTINGS_PATH}
    />
  );
}
