package ru.lambadazzz.chalanger;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DrawingReminder")
public class DrawingReminderPlugin extends Plugin {
    @PluginMethod
    public void set(PluginCall call) {
        String time = call.getString("time", "");
        if (!time.isEmpty() && !time.matches("([01][0-9]|2[0-3]):[0-5][0-9]")) {
            call.reject("Выбери время напоминания.");
            return;
        }
        if (!time.isEmpty() && !DrawingReminderReceiver.notificationsAllowed(getContext())) {
            call.reject("Разреши уведомления для Чаланжера в настройках Android.");
            return;
        }
        try {
            DrawingReminderReceiver.configure(getContext(), time);
            call.resolve();
        } catch (Exception error) { call.reject("Не удалось настроить напоминание.", error); }
    }

    @PluginMethod
    public void get(PluginCall call) {
        var preferences = DrawingReminderReceiver.preferences(getContext());
        call.resolve(new JSObject().put("time", preferences.getString("time", ""))
            .put("configured", preferences.contains("time"))
            .put("allowed", DrawingReminderReceiver.notificationsAllowed(getContext())));
    }
}
