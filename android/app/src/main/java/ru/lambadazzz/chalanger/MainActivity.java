package ru.lambadazzz.chalanger;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AlbumBackupPlugin.class);
        registerPlugin(DrawingReminderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
