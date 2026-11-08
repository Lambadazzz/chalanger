package ru.lambadazzz.chalanger;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import java.util.Calendar;
import java.util.Random;

/** Selects a fresh phrase when Android delivers the alarm, even with no WebView running. */
public class DrawingReminderReceiver extends BroadcastReceiver {
    static final String FIRE = "ru.lambadazzz.chalanger.DRAWING_TIME";
    static final int NOTIFICATION_ID = 4101;
    private static final String CHANNEL = "drawing";

    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences("drawing-reminder", Context.MODE_PRIVATE);
    }

    static boolean notificationsAllowed(Context context) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel channel = manager.getNotificationChannel(CHANNEL);
        return manager.areNotificationsEnabled() && (channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE);
    }

    static void configure(Context context, String time) {
        preferences(context).edit().putString("time", time).apply();
        scheduleNext(context);
        if (time.isEmpty()) context.getSystemService(NotificationManager.class).cancel(NOTIFICATION_ID);
    }

    static long nextTrigger(String time, long now) {
        String[] pieces = time.split(":");
        Calendar next = Calendar.getInstance();
        next.setTimeInMillis(now);
        next.set(Calendar.HOUR_OF_DAY, Integer.parseInt(pieces[0]));
        next.set(Calendar.MINUTE, Integer.parseInt(pieces[1]));
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= now) next.add(Calendar.DAY_OF_YEAR, 1);
        return next.getTimeInMillis();
    }

    static void scheduleNext(Context context) {
        Intent intent = new Intent(context, DrawingReminderReceiver.class).setAction(FIRE);
        PendingIntent alarm = PendingIntent.getBroadcast(context, NOTIFICATION_ID, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        AlarmManager manager = context.getSystemService(AlarmManager.class);
        String time = preferences(context).getString("time", "");
        if (time.isEmpty()) manager.cancel(alarm);
        else manager.set(AlarmManager.RTC_WAKEUP, nextTrigger(time, System.currentTimeMillis()), alarm);
    }

    @Override
    @SuppressLint("MissingPermission") // Explicit runtime and channel checks before notify().
    public void onReceive(Context context, Intent intent) {
        if (preferences(context).getString("time", "").isEmpty()) return;
        if (FIRE.equals(intent.getAction()) && notificationsAllowed(context)) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Время порисовать", NotificationManager.IMPORTANCE_DEFAULT));
            String[] phrases = context.getResources().getStringArray(R.array.drawing_reminder_phrases);
            int previous = preferences(context).getInt("lastPhrase", -1);
            int chosen = new Random().nextInt(previous >= 0 && previous < phrases.length ? phrases.length - 1 : phrases.length);
            if (previous >= 0 && previous < phrases.length && chosen >= previous) chosen++;
            preferences(context).edit().putInt("lastPhrase", chosen).apply();
            PendingIntent open = PendingIntent.getActivity(context, NOTIFICATION_ID,
                new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification notification = new Notification.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification).setColor(0xFF6526D5)
                .setContentTitle(phrases[chosen]).setContentText("Загляни в альбом — там ждёт твоя следующая маленькая история.")
                .setContentIntent(open).setAutoCancel(true).build();
            manager.notify(NOTIFICATION_ID, notification);
        }
        scheduleNext(context);
    }
}
