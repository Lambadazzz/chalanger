package ru.lambadazzz.chalanger;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AlbumBackupPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
