package com.juicewrldapi.player;

import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Saves an in-memory file built in JS (a playlist ZIP, a synced-lyrics
 * export, a bulk track download) into the user's actual Downloads folder.
 *
 * Why this exists: the desktop/web build "downloads" a file with a plain
 * `<a download>` click on a blob: URL — that works in a real browser and in
 * Electron, but this WebView doesn't wire `download` up to an actual save
 * the same way, so every download in the app silently did nothing on
 * Android; the click just no-ops.
 *
 * On API 29+ (the overwhelming majority of active devices) this writes
 * through MediaStore.Downloads, which needs no storage permission at all.
 * Below that it falls back to the legacy public Downloads directory, which
 * technically needs a runtime-granted WRITE_EXTERNAL_STORAGE on API 23–28 —
 * not requested here (no permission-request plumbing exists in this app yet,
 * and API ≤28 is now a vanishing sliver of devices); the write will fail
 * there with a clear error via the normal reject path rather than crash.
 */
@CapacitorPlugin(name = "Downloads")
public class DownloadsPlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        final String filename = call.getString("filename");
        final String base64 = call.getString("base64");
        final String mimeType = call.getString("mimeType", "application/octet-stream");
        if (filename == null || base64 == null) { call.reject("filename and base64 are required"); return; }

        new Thread(() -> {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    saveViaMediaStore(filename, mimeType, bytes);
                } else {
                    saveLegacy(filename, bytes);
                }
                JSObject ret = new JSObject();
                ret.put("filename", filename);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "Save failed" : e.getMessage(), e);
            }
        }).start();
    }

    private void saveViaMediaStore(String filename, String mimeType, byte[] bytes) throws Exception {
        Context ctx = getContext();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
        values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
        // Hidden from other apps (and from the user opening Files mid-write)
        // until the write below finishes, then cleared.
        values.put(MediaStore.Downloads.IS_PENDING, 1);

        Uri uri = ctx.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new Exception("Could not create the download entry");
        try (OutputStream out = ctx.getContentResolver().openOutputStream(uri)) {
            if (out == null) throw new Exception("Could not open the download for writing");
            out.write(bytes);
        }
        values.clear();
        values.put(MediaStore.Downloads.IS_PENDING, 0);
        ctx.getContentResolver().update(uri, values, null, null);
    }

    private void saveLegacy(String filename, byte[] bytes) throws Exception {
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("Could not create the Downloads directory");
        File out = new File(dir, filename);
        try (FileOutputStream fos = new FileOutputStream(out)) {
            fos.write(bytes);
        }
    }
}
