package com.juicewrldapi.player;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Bridges JS playback state to a real Android media session — see
 * PlaybackService for the foreground Service / MediaSessionCompat /
 * AudioManager mechanics this starts and drives. lib/mediaControl.ts is the
 * JS-side counterpart.
 *
 * Every playback *decision* (what "next" does, whether to duck or pause on a
 * focus change, what track is loaded) stays in JS — this plugin and
 * PlaybackService only report state one way and events the other; neither
 * one plays or controls audio itself.
 */
@CapacitorPlugin(
    name = "MediaControl",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class MediaSessionPlugin extends Plugin implements PlaybackService.Listener {

    @Override
    public void load() {
        PlaybackService.setListener(this);
    }

    private void ensureStarted() {
        Context ctx = getContext();
        Intent intent = new Intent(ctx, PlaybackService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermsCallback");
            return;
        }
        ensureStarted();
        call.resolve();
    }

    @PermissionCallback
    private void notificationPermsCallback(PluginCall call) {
        // ensureStarted() runs regardless of the outcome — a denied
        // permission just means the notification stays invisible while the
        // foreground service (and audio focus) keep working normally.
        ensureStarted();
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), PlaybackService.class));
        call.resolve();
    }

    @PluginMethod
    public void updateMetadata(PluginCall call) {
        String title = call.getString("title", "");
        String artist = call.getString("artist", "");
        String album = call.getString("album", "");
        Double durationSec = call.getDouble("duration");
        long durationMs = durationSec != null ? Math.round(durationSec * 1000) : 0L;
        Bitmap artwork = decodeArtwork(call.getString("artworkBase64"));

        PlaybackService.pendingTitle = title;
        PlaybackService.pendingArtist = artist;
        PlaybackService.pendingAlbum = album;
        PlaybackService.pendingArtwork = artwork;
        PlaybackService.pendingDurationMs = durationMs;

        ensureStarted();
        PlaybackService instance = PlaybackService.getInstance();
        if (instance != null) instance.update(title, artist, album, artwork, durationMs);
        call.resolve();
    }

    @PluginMethod
    public void updatePlaybackState(PluginCall call) {
        Boolean playingVal = call.getBoolean("playing");
        boolean playing = playingVal != null && playingVal;
        Double positionSec = call.getDouble("position");
        long positionMs = positionSec != null ? Math.round(positionSec * 1000) : 0L;
        Double speedVal = call.getDouble("speed");
        float speed = speedVal != null ? speedVal.floatValue() : 1f;

        PlaybackService.pendingPlaying = playing;
        PlaybackService.pendingPositionMs = positionMs;
        PlaybackService.pendingSpeed = speed;

        ensureStarted();
        PlaybackService instance = PlaybackService.getInstance();
        if (instance != null) instance.updatePlaybackState(playing, positionMs, speed);
        call.resolve();
    }

    private Bitmap decodeArtwork(String base64) {
        if (base64 == null || base64.isEmpty()) return null;
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Exception e) {
            return null;
        }
    }

    // ── PlaybackService.Listener — native callbacks routed to JS ────────────

    @Override public void onPlay() { notifyListeners("play", new JSObject()); }
    @Override public void onPause() { notifyListeners("pause", new JSObject()); }
    @Override public void onNext() { notifyListeners("next", new JSObject()); }
    @Override public void onPrevious() { notifyListeners("previous", new JSObject()); }

    @Override
    public void onSeekTo(long positionMs) {
        JSObject data = new JSObject();
        data.put("position", positionMs / 1000.0);
        notifyListeners("seek", data);
    }

    @Override
    public void onAudioFocusChange(String type) {
        JSObject data = new JSObject();
        data.put("type", type);
        notifyListeners("focus", data);
    }
}
