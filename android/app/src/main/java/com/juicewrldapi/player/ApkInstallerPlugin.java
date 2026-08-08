package com.juicewrldapi.player;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * In-app APK updates for the sideloaded Android build.
 *
 * This app isn't on the Play Store (unreleased-music content), so it gets no
 * store update channel — lib/androidUpdate.ts finds the newest `android-v*`
 * GitHub release and this plugin downloads and installs it without leaving
 * the app.
 *
 * Three things here are non-obvious and are why this is native rather than JS:
 *
 *  - The installer runs in another process, so it cannot read a file:// path
 *    we hand it (FileUriExposedException on API 24+). The APK has to be
 *    exposed through FileProvider as a content:// URI carrying
 *    FLAG_GRANT_READ_URI_PERMISSION.
 *  - REQUEST_INSTALL_PACKAGES in the manifest only grants the *ability to
 *    ask*. On API 26+ the user must additionally allow "install unknown apps"
 *    for this app; canInstall()/openInstallSettings() let the UI check and
 *    route them there instead of firing an intent that silently no-ops.
 *  - GitHub release URLs 302 to objects.githubusercontent.com. Redirects are
 *    followed manually because HttpURLConnection refuses to auto-follow one
 *    that changes protocol, and these can land on a different host/scheme.
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    private static final int MAX_REDIRECTS = 5;

    /** Whether the OS will let us launch a package install right now. */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("value", hasInstallPermission());
        call.resolve(ret);
    }

    private boolean hasInstallPermission() {
        // Below API 26 the manifest permission alone is sufficient; the
        // per-app "unknown sources" toggle didn't exist yet.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    /** Opens the per-app "install unknown apps" screen for this package. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) { call.resolve(); return; }
        Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    /**
     * Download `url` and hand it to the package installer.
     *
     * Runs off the caller's thread; emits `downloadProgress` ({percent,
     * bytes, total}) as it goes, then resolves once the installer has been
     * launched. It deliberately does NOT report whether the install itself
     * succeeded — that happens in another process, and if it does succeed
     * this process is replaced. The UI treats "installer launched" as done.
     */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) { call.reject("A url is required"); return; }

        if (!hasInstallPermission()) {
            call.reject("PERMISSION_REQUIRED");
            return;
        }

        new Thread(() -> {
            try {
                File apk = download(url, call);
                launchInstaller(apk);
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "Download failed" : e.getMessage(), e);
            }
        }).start();
    }

    private File download(String url, PluginCall call) throws Exception {
        // App-specific external dir: no storage permission needed, and it's
        // covered by the <external-files-path> entry in res/xml/file_paths.xml.
        File dir = new File(getContext().getExternalFilesDir(null), "updates");
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("Could not create download directory");

        // One fixed filename, replaced each time — otherwise every check-and-
        // update cycle leaves another ~7 MB APK behind forever.
        File out = new File(dir, "update.apk");
        if (out.exists() && !out.delete()) throw new Exception("Could not clear previous download");

        HttpURLConnection conn = null;
        String current = url;
        try {
            for (int hop = 0; ; hop++) {
                conn = (HttpURLConnection) new URL(current).openConnection();
                conn.setInstanceFollowRedirects(false);
                conn.setConnectTimeout(30000);
                conn.setReadTimeout(30000);
                conn.connect();
                int code = conn.getResponseCode();
                if (code == HttpURLConnection.HTTP_MOVED_PERM
                        || code == HttpURLConnection.HTTP_MOVED_TEMP
                        || code == HttpURLConnection.HTTP_SEE_OTHER
                        || code == 307 || code == 308) {
                    if (hop >= MAX_REDIRECTS) throw new Exception("Too many redirects");
                    String next = conn.getHeaderField("Location");
                    conn.disconnect();
                    if (next == null) throw new Exception("Redirect without a Location header");
                    // Resolve against the current URL so a relative Location works.
                    current = new URL(new URL(current), next).toString();
                    continue;
                }
                if (code != HttpURLConnection.HTTP_OK) throw new Exception("Server returned " + code);
                break;
            }

            int total = conn.getContentLength();
            byte[] buf = new byte[16384];
            long done = 0;
            int lastPct = -1;

            try (InputStream in = conn.getInputStream(); FileOutputStream fos = new FileOutputStream(out)) {
                int n;
                while ((n = in.read(buf)) != -1) {
                    fos.write(buf, 0, n);
                    done += n;
                    if (total > 0) {
                        int pct = (int) (done * 100 / total);
                        // Only on change — an event per 16 KB chunk would be
                        // hundreds of needless bridge crossings and re-renders.
                        if (pct != lastPct) {
                            lastPct = pct;
                            JSObject p = new JSObject();
                            p.put("percent", pct);
                            p.put("bytes", done);
                            p.put("total", total);
                            notifyListeners("downloadProgress", p);
                        }
                    }
                }
            }
            return out;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void launchInstaller(File apk) throws Exception {
        Activity activity = getActivity();
        if (activity == null) throw new Exception("No activity available");

        Uri uri = FileProvider.getUriForFile(
                getContext(), getContext().getPackageName() + ".fileprovider", apk);

        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        // The installer is a separate process and only gets read access to the
        // APK through this grant flag on the content:// URI.
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(intent);
    }
}
