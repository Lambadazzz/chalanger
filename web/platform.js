import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';

export const native = Capacitor.isNativePlatform();
const Backup = registerPlugin('AlbumBackup');
const DrawingReminder = registerPlugin('DrawingReminder');

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
    await DrawingReminder.set({ time: '' });
    await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
    return;
  }
  const permission = await LocalNotifications.requestPermissions();
  if (permission.display !== 'granted') throw new Error('Уведомления выключены. Их можно разрешить в настройках Android.');
  const [hour, minute] = time.split(':').map(Number);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error('Выбери время напоминания.');
  }
  await DrawingReminder.set({ time });
  // Remove the fixed-phrase reminder from 0.1 after its replacement is saved.
  await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
}

export async function reminderTime() {
  if (!native) return '';
  const state = await DrawingReminder.get();
  if (state.configured) return state.time;
  const { notifications } = await LocalNotifications.getPending();
  const schedule = notifications.find(item => item.id === 1)?.schedule?.on;
  const time = schedule ? String(schedule.hour).padStart(2, '0') + ':' + String(schedule.minute).padStart(2, '0') : '';
  if (time && state.allowed) await setReminder(time);
  return time;
}

export function handleAndroidBack(onBack) {
  if (native) return App.addListener('backButton', () => {
    if (!onBack()) void App.minimizeApp();
  });
}
