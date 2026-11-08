package ru.lambadazzz.chalanger;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.pm.PackageManager;
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
}
