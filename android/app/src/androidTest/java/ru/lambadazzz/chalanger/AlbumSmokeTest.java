package ru.lambadazzz.chalanger;

import static org.junit.Assert.*;
import android.content.Context;
import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.os.Build;
import java.io.File;
import java.io.FileOutputStream;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AlbumSmokeTest {
    private void capture(Context context, String name) throws Exception {
        File directory = new File(context.getExternalFilesDir(null), "artifacts");
        assertTrue(directory.isDirectory() || directory.mkdirs());
        Bitmap bitmap = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        try (FileOutputStream stream = new FileOutputStream(new File(directory, name))) {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream);
        }
        bitmap.recycle();
    }
    private String js(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, value -> {
            result.set(value);
            latch.countDown();
        }));
        assertTrue("WebView did not answer", latch.await(5, TimeUnit.SECONDS));
        return result.get();
    }

    private void awaitTrue(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
        while (System.nanoTime() < deadline) {
            if ("true".equals(js(scenario, script))) return;
            Thread.sleep(200);
        }
        fail("Condition not met: " + script);
    }

    @Test
    public void offlineAlbumPersistsAcrossActivityRestart() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("ru.lambadazzz.chalanger", context.getPackageName());
        String[] requested = context.getPackageManager().getPackageInfo(context.getPackageName(), PackageManager.GET_PERMISSIONS).requestedPermissions;
        assertFalse(Arrays.asList(requested).contains("android.permission.INTERNET"));
        assertFalse(Arrays.asList(requested).contains("android.permission.SCHEDULE_EXACT_ALARM"));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            awaitTrue(scenario, "!!document.querySelector('#add') && !document.querySelector('#add').disabled");
            assertEquals("true", js(scenario, "window.Capacitor.isNativePlatform()"));
            js(scenario, "document.querySelector('#help-dialog').close(); document.querySelector('#add').click(); document.querySelector('textarea').value='Android проверка'; document.querySelector('#editor-form button[type=submit]').click();");
            awaitTrue(scenario, "document.querySelector('.card p')?.textContent === 'Android проверка'");
            js(scenario, "document.querySelector('.card-favorite').click()");
            awaitTrue(scenario, "document.querySelector('.card-favorite')?.getAttribute('aria-pressed') === 'true'");
            scenario.recreate();
            awaitTrue(scenario, "document.querySelector('.card p')?.textContent === 'Android проверка'");
            assertEquals("true", js(scenario, "document.querySelector('.card-favorite').getAttribute('aria-pressed') === 'true'"));
            js(scenario, "document.querySelector('#help-dialog').close(); document.querySelector('#add').click(); document.querySelector('#open-generator').click()");
            awaitTrue(scenario, "document.querySelector('#idea-ticket')?.textContent.length > 0");
        }
    }

    @Test
    public void reminderSwitchAndFreshPhrasesWorkWithoutJavascriptDelivery() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        if (Build.VERSION.SDK_INT >= 33) {
            InstrumentationRegistry.getInstrumentation().getUiAutomation()
                .grantRuntimePermission(context.getPackageName(), Manifest.permission.POST_NOTIFICATIONS);
        }
        DrawingReminderReceiver.configure(context, "");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            awaitTrue(scenario, "!!document.querySelector('#add') && !document.querySelector('#add').disabled");
            js(scenario, "if (!document.querySelector('#help-dialog').open) document.querySelector('#help-dialog').showModal()");
            awaitTrue(scenario, "document.getAnimations().every(a=>a.playState !== 'running')");
            capture(context, "welcome-0.2.png");
            js(scenario, "document.querySelector('#help-dialog').close(); document.querySelector('#add').click(); document.querySelector('#open-generator').click()");
            awaitTrue(scenario, "document.getAnimations().every(a=>a.playState !== 'running')");
            assertEquals("true", js(scenario, "document.querySelector('#editor').getBoundingClientRect().top >= (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top')) || 0) + 20"));
            capture(context, "generator-0.2.png");
            js(scenario, "document.querySelector('#editor').close(); document.querySelector('#palette').click()");
            awaitTrue(scenario, "!document.querySelector('#reminder-toggle').disabled");
            js(scenario, "document.querySelector('#reminder-time').value='19:23'; document.querySelector('#reminder-toggle').click()");
            awaitTrue(scenario, "document.querySelector('#reminder-toggle').getAttribute('aria-checked') === 'true'");
            assertEquals("19:23", DrawingReminderReceiver.preferences(context).getString("time", ""));
            js(scenario, "document.querySelector('#reminders').scrollIntoView({block:'center'})");
            awaitTrue(scenario, "document.getAnimations().every(a=>a.playState !== 'running')");
            capture(context, "reminder-0.2.png");
            String previous = null;
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            String[] phrases = context.getResources().getStringArray(R.array.drawing_reminder_phrases);
            assertEquals(10, phrases.length);
            // Receiver delivery is native and does not depend on any JS listener.
            for (int attempt = 0; attempt < 3; attempt++) {
                new DrawingReminderReceiver().onReceive(context, new Intent(DrawingReminderReceiver.FIRE));
                Thread.sleep(600); // Allow NotificationManager to publish the update; avoid rate limiting.
                Notification notification = Arrays.stream(manager.getActiveNotifications())
                    .filter(item -> item.getId() == DrawingReminderReceiver.NOTIFICATION_ID).findFirst().get().getNotification();
                String title = notification.extras.getCharSequence(Notification.EXTRA_TITLE).toString();
                assertTrue(Arrays.asList(phrases).contains(title));
                assertNotEquals(previous, title);
                previous = title;
            }
            scenario.recreate();
            awaitTrue(scenario, "!!document.querySelector('#add') && !document.querySelector('#add').disabled");
            js(scenario, "document.querySelector('#help-dialog').close(); document.querySelector('#palette').click()");
            awaitTrue(scenario, "document.querySelector('#reminder-toggle').getAttribute('aria-checked') === 'true'");
            js(scenario, "document.querySelector('#reminder-toggle').click()");
            awaitTrue(scenario, "document.querySelector('#reminder-toggle').getAttribute('aria-checked') === 'false' && !document.querySelector('#reminder-toggle').disabled");
            assertEquals("", DrawingReminderReceiver.preferences(context).getString("time", ""));
        } finally { DrawingReminderReceiver.configure(context, ""); }
    }
}
