package com.desmond.gptwake;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Credential-protected configuration for an optional Porcupine pt-BR detector.
 * Secrets are encrypted via AndroidKeyStore and are never included in APK/logs.
 * Files imported via the document picker are copied into private app storage.
 */
public final class PtBrSettings {
    private static final String NAME = "jeanwake_pt_br";
    private static final String ALIAS = "jeanwake_picovoice_v1";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_CIPHER = "access_key_cipher";
    private static final String KEY_IV = "access_key_iv";
    private static final int MAX_MODEL_BYTES = 10 * 1024 * 1024;

    private PtBrSettings() { }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(NAME, Context.MODE_PRIVATE);
    }

    public static boolean isEnabled(Context context) {
        return prefs(context).getBoolean(KEY_ENABLED, false);
    }

    public static void setEnabled(Context context, boolean enabled) {
        if (enabled && !isReady(context)) {
            throw new IllegalStateException("AccessKey, Android .ppn and Portuguese .pv required");
        }
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply();
        if (enabled) VoskPtBrAssets.setEnabled(context, false);
    }

    public static File keywordFile(Context context) {
        return new File(context.getFilesDir(), "pt_br_keyword.ppn");
    }

    public static File languageFile(Context context) {
        return new File(context.getFilesDir(), "pt_br_model.pv");
    }

    public static boolean hasKeyword(Context context) {
        return keywordFile(context).isFile() && keywordFile(context).length() > 0;
    }

    public static boolean hasLanguage(Context context) {
        return languageFile(context).isFile() && languageFile(context).length() > 0;
    }

    public static boolean hasAccessKey(Context context) {
        return accessKey(context) != null;
    }

    public static boolean isReady(Context context) {
        return hasKeyword(context) && hasLanguage(context) && hasAccessKey(context);
    }

    private static SecretKey getKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        KeyStore.SecretKeyEntry entry =
                (KeyStore.SecretKeyEntry) store.getEntry(ALIAS, null);
        if (entry != null) return entry.getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build());
        return generator.generateKey();
    }

    public static void saveAccessKey(Context context, String value) throws Exception {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty() || normalized.length() > 4096) {
            throw new IllegalArgumentException("Invalid AccessKey");
        }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getKey());
        byte[] encrypted = cipher.doFinal(
                normalized.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        prefs(context).edit()
                .putString(KEY_IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .putString(KEY_CIPHER, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .commit();
    }

    public static String accessKey(Context context) {
        SharedPreferences p = prefs(context);
        String iv = p.getString(KEY_IV, null);
        String ciphertext = p.getString(KEY_CIPHER, null);
        if (iv == null || ciphertext == null) return null;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getKey(), new GCMParameterSpec(128,
                    Base64.decode(iv, Base64.NO_WRAP)));
            byte[] plaintext = cipher.doFinal(Base64.decode(ciphertext, Base64.NO_WRAP));
            return new String(plaintext, java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            // Keystore key can be invalidated after OS security changes; fail closed.
            return null;
        }
    }

    public static void importModel(Context context, Uri uri, boolean keyword)
            throws IOException {
        File dest = keyword ? keywordFile(context) : languageFile(context);
        File staging = new File(context.getFilesDir(), dest.getName() + ".tmp");
        long total = 0;
        try (InputStream in = context.getContentResolver().openInputStream(uri)) {
            if (in == null) throw new IOException("Could not open selected document");
            try (FileOutputStream out = new FileOutputStream(staging)) {
                byte[] buffer = new byte[8192];
                int n;
                while ((n = in.read(buffer)) != -1) {
                    total += n;
                    if (total > MAX_MODEL_BYTES) throw new IOException("Model too large");
                    out.write(buffer, 0, n);
                }
            }
            if (total == 0) throw new IOException("Model is empty");
            if (dest.exists() && !dest.delete()) throw new IOException("Cannot replace model");
            if (!staging.renameTo(dest)) throw new IOException("Cannot save model");
        } finally {
            if (staging.exists()) staging.delete();
        }
    }

    /** Populate private model storage from the verified, Apache-2.0 upstream asset. */
    public static void ensureBundledPortugueseModel(Context context) throws IOException {
        if (hasLanguage(context)) return;
        final String expected = "21bee74582f81ce6f43d5580ee604bd358e24c71381f15d5af719c6f0beb0ed8";
        File staging = new File(context.getFilesDir(), "pt_br_model.pv.tmp");
        File destination = languageFile(context);
        try (InputStream in = context.getAssets().open("picovoice/porcupine_params_pt.pv");
             FileOutputStream out = new FileOutputStream(staging)) {
            java.security.MessageDigest digest;
            try {
                digest = java.security.MessageDigest.getInstance("SHA-256");
            } catch (java.security.NoSuchAlgorithmException e) {
                throw new IOException("SHA-256 not available", e);
            }
            byte[] buffer = new byte[8192];
            int length;
            long total = 0;
            while ((length = in.read(buffer)) != -1) {
                total += length;
                if (total > MAX_MODEL_BYTES) throw new IOException("Model size exceeded");
                digest.update(buffer, 0, length);
                out.write(buffer, 0, length);
            }
            StringBuilder hex = new StringBuilder();
            for (byte b : digest.digest()) {
                hex.append(String.format(java.util.Locale.ROOT, "%02x", b & 0xff));
            }
            if (!expected.equals(hex.toString())) throw new IOException("Model digest mismatch");
        } finally {
            // The temporary file is cleaned up after promotion below.
        }
        try {
            if (!staging.renameTo(destination)) throw new IOException("Cannot install model");
        } finally {
            if (staging.exists()) staging.delete();
        }
    }

}