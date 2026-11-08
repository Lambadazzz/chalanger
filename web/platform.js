import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';

export const native = Capacitor.isNativePlatform();
const Backup = registerPlugin('AlbumBackup');

export async function exportAlbum(contents) {
  const filename = 'chalanger-' + new Date().toISOString().slice(0, 10) + '.json';
  if (native) return Backup.save({ contents, filename });
  const blob = new Blob([contents], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  return { saved: true };
}

export async function importAlbum() {
  return Backup.open();
}

export async function shareIdea(text) {
  if (native) return Share.share({ title: 'Идея для рисунка', text });
  if (navigator.share) return navigator.share({ title: 'Идея для рисунка', text });
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return { copied: true };
  }
  throw new Error('Поделиться можно в Android-приложении или через меню браузера.');
}

export async function setReminder(time) {
  if (!native) throw new Error('Напоминания доступны в Android-приложении.');
  if (!time) {
    await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
    return;
  }
  const permission = await LocalNotifications.requestPermissions();
  if (permission.display !== 'granted') throw new Error('Уведомления выключены. Их можно разрешить в настройках Android.');
  const [hour, minute] = time.split(':').map(Number);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error('Выбери время напоминания.');
  }
  await LocalNotifications.createChannel({ id: 'drawing', name: 'Время порисовать', importance: 3 });
  await LocalNotifications.schedule({ notifications: [{
    id: 1, title: 'Время порисовать ✦', body: 'В альбоме ждут идеи. Даже маленький набросок — уже начало.',
    channelId: 'drawing', isExactNotification: false,
    schedule: { on: { hour, minute }, repeats: true, allowWhileIdle: false }
  }] });
}

export async function reminderTime() {
  if (!native) return '';
  const { notifications } = await LocalNotifications.getPending();
  const schedule = notifications.find(item => item.id === 1)?.schedule?.on;
  return schedule ? String(schedule.hour).padStart(2, '0') + ':' + String(schedule.minute).padStart(2, '0') : '';
}

export function handleAndroidBack(onBack) {
  if (native) return App.addListener('backButton', () => {
    if (!onBack()) void App.minimizeApp();
  });
}
