package com.desmond.gptwake;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Offline Portuguese model bundled with the APK. No account, network or
 * credentials required. Files remain inside app-private storage.
 */
public final class VoskPtBrAssets {
    private static final String FILE = "vosk/vosk-model-small-pt-0.3.zip";
    private static final String SHA256 =
            "6e1ce909032e1afa7a88e68a3d628ecafff302bdf195befab308826c395e93b7";
    private static final String PREF = "jeanwake_vosk_local";
    private static final String ENABLED = "enabled";
    private static final String DIR = "vosk-model-small-pt-0.3";
    private static final long MAX_UNPACKED_BYTES = 150L * 1024L * 1024L;

    private VoskPtBrAssets() {}

    public static boolean enabled(Context ctx) {
        return ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
                .getBoolean(ENABLED, false);
    }

    public static void setEnabled(Context ctx, boolean enabled) {
        if (enabled && !isReady(ctx))
            throw new IllegalStateException("Model must be prepared before enabling Vosk");
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
                .putBoolean(ENABLED, enabled).apply();
        if (enabled) PtBrSettings.setEnabled(ctx, false);
    }

    public static File modelDir(Context ctx) {
        return new File(ctx.getFilesDir(), DIR);
    }

    public static boolean isReady(Context ctx) {
        File d = modelDir(ctx);
        return new File(d, ".jeanwake_ready").exists()
                && new File(d, "final.mdl").isFile()
                && new File(d, "Gr.fst").isFile();
    }

    private static String hex(byte[] bytes) {
        StringBuilder hex = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) hex.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        return hex.toString();
    }

    public static synchronized void prepare(Context ctx) throws Exception {
        if (isReady(ctx)) return;
        File dest = modelDir(ctx);
        if (!dest.exists() && !dest.mkdirs()) throw new IOException("No model directory");
        // A zipped model is public, bundled with the APK; verify before extraction.
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = ctx.getAssets().open(FILE)) {
            byte[] buffer = new byte[8192]; int n;
            while ((n = input.read(buffer)) != -1) digest.update(buffer, 0, n);
        }
        if (!SHA256.equals(hex(digest.digest()))) throw new IOException("Vosk zip SHA256 mismatch");

        long extracted = 0; int files = 0;
        String canonicalRoot = dest.getCanonicalPath() + File.separator;
        try (InputStream input = ctx.getAssets().open(FILE);
             ZipInputStream zip = new ZipInputStream(input)) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                String name = entry.getName();
                String prefix = DIR + "/";
                if (!name.startsWith(prefix)) {
                    throw new IOException("Unexpected model archive layout");
                }
                String relative = name.substring(prefix.length());
                if (relative.length() == 0) { zip.closeEntry(); continue; }
                File out = new File(dest, relative);
                String canonical = out.getCanonicalPath();
                if (!canonical.startsWith(canonicalRoot))
                    throw new IOException("Rejected unsafe model entry");
                if (entry.isDirectory()) {
                    if (!out.exists() && !out.mkdirs()) throw new IOException("Cannot create model folder");
                } else {
                    if (++files > 300) throw new IOException("Too many model files");
                    File parent = out.getParentFile();
                    if (!parent.exists() && !parent.mkdirs()) throw new IOException("Cannot create model folder");
                    try (FileOutputStream output = new FileOutputStream(out)) {
                        byte[] buffer = new byte[8192]; int n;
                        while ((n = zip.read(buffer)) != -1) {
                            extracted += n;
                            if (extracted > MAX_UNPACKED_BYTES) throw new IOException("Model too large");
                            output.write(buffer, 0, n);
                        }
                    }
                }
                zip.closeEntry();
            }
        }
        if (!new File(dest, "final.mdl").isFile()
                || !new File(dest, "Gr.fst").isFile()) {
            throw new IOException("Invalid Vosk model format");
        }
        if (!new File(dest, ".jeanwake_ready").createNewFile()
                && !isReady(ctx)) throw new IOException("Cannot mark model ready");
        L.i("JEANWAKE_VOSK_MODEL_PREPARED modelFiles=" + files);
    }
}
