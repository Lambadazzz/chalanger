package ru.lambadazzz.chalanger;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** User-selected documents only: no storage or all-files permission. */
@CapacitorPlugin(name = "AlbumBackup")
public class AlbumBackupPlugin extends Plugin {
    private static final int MAX_BYTES = 10 * 1024 * 1024;

    @PluginMethod
    public void save(PluginCall call) {
        String contents = call.getString("contents");
        if (contents == null || contents.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
            call.reject("Backup must not exceed 10 MB");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("filename", "chalanger.json"));
        startActivityForResult(call, intent, "saved");
    }

    @ActivityCallback
    private void saved(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.resolve(new JSObject().put("cancelled", true));
            return;
        }
        getBridge().execute(() -> {
            try (OutputStream out = getContext().getContentResolver().openOutputStream(result.getData().getData(), "wt")) {
                if (out == null) throw new java.io.IOException("Document unavailable");
                out.write(call.getString("contents", "").getBytes(StandardCharsets.UTF_8));
                call.resolve(new JSObject().put("saved", true));
            } catch (Exception error) { call.reject("Could not save backup", error); }
        });
    }

    @PluginMethod
    public void open(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "application/json", "text/plain", "application/octet-stream" });
        startActivityForResult(call, intent, "opened");
    }

    @ActivityCallback
    private void opened(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.resolve(new JSObject().put("cancelled", true));
            return;
        }
        getBridge().execute(() -> {
            try (InputStream in = getContext().getContentResolver().openInputStream(result.getData().getData());
                 ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                if (in == null) throw new java.io.IOException("Document unavailable");
                byte[] chunk = new byte[8192];
                int size;
                while ((size = in.read(chunk)) != -1) {
                    if (bytes.size() + size > MAX_BYTES) throw new java.io.IOException("Backup exceeds 10 MB");
                    bytes.write(chunk, 0, size);
                }
                call.resolve(new JSObject().put("contents", bytes.toString(StandardCharsets.UTF_8.name())));
            } catch (Exception error) { call.reject("Could not open backup", error); }
        });
    }
}
