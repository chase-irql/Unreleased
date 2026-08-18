package com.juicewrldapi.player;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.IBinder;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import androidx.media.session.MediaButtonReceiver;

/**
 * The actual "keep the app alive and show real transport controls" half of
 * Android playback. Audio itself never touches this class — it plays inside
 * the WebView's own <audio> element, driven from Player.tsx — this Service
 * exists purely so the OS treats that playback as a real foreground media
 * session instead of background webview work it's free to kill:
 *
 *  - startForeground() with a MediaStyle notification, so Android gives this
 *    process foreground priority instead of killing it as an idle background
 *    app the moment the user switches away.
 *  - A MediaSessionCompat, so the notification/lock-screen/Bluetooth/wear
 *    transport controls exist at all and hardware media buttons have
 *    somewhere to go.
 *  - AudioManager focus, so another app's audio doesn't play on top of this
 *    one — requested while playing, abandoned while paused, exactly like any
 *    other well-behaved media app.
 *
 * JS (see lib/mediaControl.ts) drives all of this through MediaSessionPlugin
 * — it reports metadata/playback state and reacts to the Listener callbacks
 * below (play/pause/seek/focus changes); this class makes no playback
 * decisions of its own; see MediaSessionPlugin for that split.
 */
public class PlaybackService extends Service {

    private static final String CHANNEL_ID = "playback";
    private static final int NOTIFICATION_ID = 1;

    /** Routes MediaSession/AudioFocus callbacks back to JS. Set once by
     *  MediaSessionPlugin.load() — this app never runs more than one plugin
     *  instance, so a static slot (rather than a bind/messenger dance) is
     *  the simplest thing that works. */
    public interface Listener {
        void onPlay();
        void onPause();
        void onNext();
        void onPrevious();
        void onSeekTo(long positionMs);
        void onAudioFocusChange(String type);
    }

    private static Listener listener;
    public static void setListener(Listener l) { listener = l; }

    private static PlaybackService instance;
    @Nullable
    public static PlaybackService getInstance() { return instance; }

    // Applied in onCreate() if set before the service finished starting —
    // covers the race between MediaSessionPlugin.ensureStarted() and this
    // Service's onCreate() actually running. Cheap enough to just always set
    // these from the plugin rather than track whether they're "needed".
    public static String pendingTitle = "";
    public static String pendingArtist = "";
    public static String pendingAlbum = "";
    public static Bitmap pendingArtwork = null;
    public static long pendingDurationMs = 0L;
    public static boolean pendingPlaying = false;
    public static long pendingPositionMs = 0L;
    public static float pendingSpeed = 1f;

    private MediaSessionCompat mediaSession;
    private AudioManager audioManager;
    private AudioManager.OnAudioFocusChangeListener focusChangeListener;
    private AudioFocusRequest focusRequest;
    private boolean hasFocus = false;

    private String title = "";
    private String artist = "";
    private String album = "";
    private Bitmap artwork;
    private long durationMs = 0L;
    private boolean isPlaying = false;
    private long positionMs = 0L;
    private float speed = 1f;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);

        mediaSession = new MediaSessionCompat(this, "UnreleasedPlayback");
        mediaSession.setFlags(
            MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
        );
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { if (listener != null) listener.onPlay(); }
            @Override public void onPause() { if (listener != null) listener.onPause(); }
            @Override public void onStop() { if (listener != null) listener.onPause(); }
            @Override public void onSkipToNext() { if (listener != null) listener.onNext(); }
            @Override public void onSkipToPrevious() { if (listener != null) listener.onPrevious(); }
            @Override public void onSeekTo(long pos) { if (listener != null) listener.onSeekTo(pos); }
        });
        mediaSession.setActive(true);

        focusChangeListener = change -> {
            String type;
            switch (change) {
                case AudioManager.AUDIOFOCUS_LOSS:
                    hasFocus = false;
                    type = "loss";
                    break;
                case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                    type = "transientLoss";
                    break;
                case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                    type = "duck";
                    break;
                case AudioManager.AUDIOFOCUS_GAIN:
                    hasFocus = true;
                    type = "gain";
                    break;
                default:
                    return;
            }
            if (listener != null) listener.onAudioFocusChange(type);
        };

        // Pick up whatever JS already reported before this onCreate() ran.
        title = pendingTitle; artist = pendingArtist; album = pendingAlbum;
        artwork = pendingArtwork; durationMs = pendingDurationMs;
        isPlaying = pendingPlaying; positionMs = pendingPositionMs; speed = pendingSpeed;
        applyMetadataToSession();
        applyStateToSession();

        createChannel();
        startForegroundCompat(buildNotification());
        if (isPlaying) requestAudioFocus();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && mediaSession != null) {
            MediaButtonReceiver.handleIntent(mediaSession, intent);
        }
        return START_STICKY;
    }

    @Override
    @Nullable
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        abandonAudioFocusIfHeld();
        if (mediaSession != null) { mediaSession.setActive(false); mediaSession.release(); }
        if (instance == this) instance = null;
        super.onDestroy();
    }

    /** Called by MediaSessionPlugin whenever JS reports new track metadata. */
    public void update(String title, String artist, String album, Bitmap artwork, long durationMs) {
        this.title = title;
        this.artist = artist;
        this.album = album;
        this.artwork = artwork;
        this.durationMs = durationMs;
        applyMetadataToSession();
        refreshNotification();
    }

    /** Called by MediaSessionPlugin whenever JS reports a play/pause/seek. */
    public void updatePlaybackState(boolean playing, long positionMs, float speed) {
        this.isPlaying = playing;
        this.positionMs = positionMs;
        this.speed = speed;
        applyStateToSession();
        refreshNotification();
        // Focus is requested while actually playing and released the moment
        // playback pauses, so another app is free to take it — same convention
        // most media apps follow rather than holding focus indefinitely.
        if (playing) requestAudioFocus(); else abandonAudioFocusIfHeld();
    }

    private void applyMetadataToSession() {
        mediaSession.setMetadata(new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
            .putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artwork)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
            .build());
    }

    private void applyStateToSession() {
        long actions = PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE
            | PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
            | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS | PlaybackStateCompat.ACTION_SEEK_TO
            | PlaybackStateCompat.ACTION_STOP;
        int state = isPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
        mediaSession.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(actions)
            .setState(state, positionMs, speed)
            .build());
    }

    private void requestAudioFocus() {
        if (hasFocus) return;
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
            .build();
        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attrs)
                .setOnAudioFocusChangeListener(focusChangeListener)
                .build();
            result = audioManager.requestAudioFocus(focusRequest);
        } else {
            result = audioManager.requestAudioFocus(
                focusChangeListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN
            );
        }
        hasFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    private void abandonAudioFocusIfHeld() {
        if (!hasFocus) return;
        hasFocus = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
            audioManager.abandonAudioFocusRequest(focusRequest);
        } else {
            audioManager.abandonAudioFocus(focusChangeListener);
        }
    }

    private void startForegroundCompat(Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Playback controls");
            channel.setShowBadge(false);
            nm.createNotificationChannel(channel);
        }
    }

    private void refreshNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIFICATION_ID, buildNotification());
    }

    private Notification buildNotification() {
        Intent openApp = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            this, 0, openApp, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent playPausePI = MediaButtonReceiver.buildMediaButtonPendingIntent(
            this, isPlaying ? PlaybackStateCompat.ACTION_PAUSE : PlaybackStateCompat.ACTION_PLAY
        );
        PendingIntent nextPI = MediaButtonReceiver.buildMediaButtonPendingIntent(
            this, PlaybackStateCompat.ACTION_SKIP_TO_NEXT
        );
        PendingIntent prevPI = MediaButtonReceiver.buildMediaButtonPendingIntent(
            this, PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
        );
        PendingIntent stopPI = MediaButtonReceiver.buildMediaButtonPendingIntent(
            this, PlaybackStateCompat.ACTION_STOP
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title.isEmpty() ? getString(R.string.app_name) : title)
            .setContentText(artist)
            .setSubText(album.isEmpty() ? null : album)
            .setLargeIcon(artwork)
            .setContentIntent(contentIntent)
            .setDeleteIntent(stopPI)
            .setOnlyAlertOnce(true)
            // Dismissible by a swipe while paused (matches most media apps'
            // convention), pinned in place while actually playing.
            .setOngoing(isPlaying)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(android.R.drawable.ic_media_previous, "Previous", prevPI)
            .addAction(
                isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                isPlaying ? "Pause" : "Play",
                playPausePI
            )
            .addAction(android.R.drawable.ic_media_next, "Next", nextPI)
            .setStyle(new MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2)
                .setShowCancelButton(true)
                .setCancelButtonIntent(stopPI));
        return builder.build();
    }
}
