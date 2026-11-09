package com.desmond.gptwake;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.net.Uri;

public final class GptLauncher {

    private static final String GPT_PACKAGE = "com.openai.chatgpt";

    private static final ComponentName GPT_VOICE_COMPONENT = new ComponentName(
            GPT_PACKAGE, "com.openai.voice.assistant.AssistantActivity");


    /**
     * Android's exported public assist action, scoped to the ChatGPT package.
     *
     * Successful startActivity() only means a launch REQUEST was accepted.
     * The assistant may reject the call, display UI without voice, or be
     * blocked by keyguard/background-activity rules.
     */

    /**
     * Launches ChatGPT exactly as its regular launcher icon does.
     * Users may enable ChatGPT > Settings > Voice > Start with Voice.
     * An accepted startActivity is NOT proof of a voice conversation.
     */
    public static boolean launchChatGptMain(Context context) {
        try {
            PackageManager pm = context.getPackageManager();
            Intent launch = pm.getLaunchIntentForPackage(GPT_PACKAGE);
            if (launch == null || launch.getComponent() == null) {
                L.i("JEANWAKE_CHATGPT_MAIN_MISSING");
                return false;
            }
            ActivityInfo info = pm.getActivityInfo(launch.getComponent(), 0);
            if (!info.exported || !GPT_PACKAGE.equals(info.packageName)) {
                L.i("JEANWAKE_CHATGPT_MAIN_NOT_EXPORTED");
                return false;
            }
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            L.i("JEANWAKE_CHATGPT_MAIN_REQUEST target=" + info.name);
            context.startActivity(launch);
            L.i("JEANWAKE_CHATGPT_MAIN_INTENT_SENT voiceSessionNotYetConfirmed=true");
            return true;
        } catch (Throwable t) {
            L.e("JEANWAKE_CHATGPT_MAIN_REQUEST_FAIL", t);
            return false;
        }
    }

    public static boolean launchPublicAssist(Context context) {
        try {
            Intent intent = new Intent(Intent.ACTION_ASSIST)
                    .setPackage(GPT_PACKAGE)
                    .addCategory(Intent.CATEGORY_DEFAULT)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            android.content.pm.ResolveInfo target =
                    context.getPackageManager().resolveActivity(intent, 0);
            if (target == null || target.activityInfo == null
                    || !target.activityInfo.exported
                    || !GPT_PACKAGE.equals(target.activityInfo.packageName)) {
                L.i("JEANWAKE_PUBLIC_ASSIST_NO_EXPORTED_HANDLER");
                return false;
            }
            L.i("JEANWAKE_PUBLIC_ASSIST_REQUEST target="
                    + target.activityInfo.name);
            context.startActivity(intent);
            L.i("JEANWAKE_PUBLIC_ASSIST_INTENT_SENT"
                    + " voiceSessionNotYetConfirmed=true");
            return true;
        } catch (Throwable t) {
            L.e("JEANWAKE_PUBLIC_ASSIST_REQUEST_FAIL", t);
            return false;
        }
    }

    public static boolean launchDirect(Context context) {
        LaunchDiagnostics.log(context);
        try {
            PackageManager pm = context.getPackageManager();
            ActivityInfo info = pm.getActivityInfo(
                    GPT_VOICE_COMPONENT, 0);
            if (!info.exported) throw new IllegalStateException("AssistantActivity not exported");
            if (info.permission != null) {
                throw new IllegalStateException("AssistantActivity needs " + info.permission);
            }
            context.startActivity(new Intent()
                    .setComponent(GPT_VOICE_COMPONENT)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            L.i("DIRECT_LAUNCH_OK");
            return true;
        } catch (Throwable t) {
            L.e("DIRECT_LAUNCH_FAIL", t);
            return false;
        }
    }

    public static boolean launchDeeplink(Context context) {
        try {
            context.startActivity(new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://chat.com/?mode=voice"))
                    .setPackage(GPT_PACKAGE)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            L.i("DEEPLINK_LAUNCH_OK");
            return true;
        } catch (Throwable t) {
            L.e("DEEPLINK_LAUNCH_FAIL", t);
            return false;
        }
    }

    public static boolean launch(Context context) {
        return launchPublicAssist(context) || launchDeeplink(context);
    }
}