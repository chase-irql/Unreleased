package com.juicewrldapi.player;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins aren't discovered automatically the way installed
        // Capacitor packages are — they have to be registered before super,
        // which is what builds the bridge.
        registerPlugin(ApkInstallerPlugin.class);
        registerPlugin(LocalLibraryPlugin.class);
        registerPlugin(OfflinePlugin.class);
        registerPlugin(DownloadsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
