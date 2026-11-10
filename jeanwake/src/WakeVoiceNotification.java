package com.desmond.gptwake;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import androidx.core.app.NotificationCompat;

/**
 * Visible, user-initiated fallback for wake detection when the keyguard is
 * locked. A tap uses a PUBLIC ChatGPT deep link and Android may request unlock.
 * This class does not launch another app while the screen is locked.
 */
public final class WakeVoiceNotification {
    public static final String CHANNEL = "jeanwake_voice_pending";
    public static final int ID = 7312;
    private static long lastPostElapsed;

    private WakeVoiceNotification() { }

    public static boolean show(Context context) {
        if (Build.VERSION.SDK_INT >= 33
                && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            L.i("JEANWAKE_VOICE_TAP_NOTIFICATION_PERMISSION_MISSING");
            return false;
        }
        long now = SystemClock.elapsedRealtime();
        if (now - lastPostElapsed < 15_000L) {
            L.i("JEANWAKE_VOICE_TAP_NOTIFICATION_COOLDOWN");
            return true;
        }
        try {
            NotificationManager manager =
                    context.getSystemService(NotificationManager.class);
            if (manager == null) return false;
            NotificationChannel channel = new NotificationChannel(CHANNEL,
                    "JeanWake: ativar voz", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Toque para abrir a voz após reconhecer Ei, GPT");
            channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
            manager.createNotificationChannel(channel);
            if (Build.VERSION.SDK_INT >= 26
                    && !manager.areNotificationsEnabled()) {
                L.i("JEANWAKE_VOICE_TAP_NOTIFICATIONS_DISABLED");
                return false;
            }
            Intent voice = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://chat.com/?mode=voice"))
                    .setPackage("com.openai.chatgpt")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            voice.putExtra(
                    "com.openai.feature.shortcut.impl.ShortcutInitializer.EXTRA_SHORTCUT",
                    "launcher_shortcut");
            PendingIntent tap = PendingIntent.getActivity(context, ID, voice,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification notification =
                    new NotificationCompat.Builder(context, CHANNEL)
                            .setSmallIcon(R.drawable.ic_mic)
                            .setContentTitle("Ei, GPT reconhecido")
                            .setContentText("Toque para abrir a voz do ChatGPT")
                            .setStyle(new NotificationCompat.BigTextStyle().bigText(
                                    "Toque para abrir a voz do ChatGPT. "
                                    + "O Android pode solicitar o desbloqueio."))
                            .setContentIntent(tap)
                            .addAction(R.drawable.ic_mic, "Abrir voz", tap)
                            .setAutoCancel(true)
                            .setLocalOnly(true)
                            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                            .setCategory(NotificationCompat.CATEGORY_REMINDER)
                            .build();
            manager.notify(ID, notification);
            lastPostElapsed = now;
            L.i("JEANWAKE_VOICE_TAP_FALLBACK_POSTED");
            return true;
        } catch (RuntimeException error) {
            L.e("JEANWAKE_VOICE_TAP_FALLBACK_FAIL", error);
            return false;
        }
    }

    public static void cancel(Context context) {
        NotificationManager manager =
                context.getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(ID);
    }
}
