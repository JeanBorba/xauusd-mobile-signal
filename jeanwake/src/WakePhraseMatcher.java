package com.desmond.gptwake;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Conservative matching of a pt-BR Vosk transcription for "Ei, ChatGPT".
 *
 * The offline model often omits "ei" and cannot literally transcribe "GPT".
 * A local Microsoft Maria pt-BR synthetic speech regression gave:
 *  "chat z peter", "charge z peter", "oi chat z peter", "chat de peter".
 *
 * Match only the combination of assistant name + GPT-like suffix, never a
 * greeting or "chat" alone. No user's speech needs to be logged.
 */
public final class WakePhraseMatcher {
    private static final Pattern PHRASE = Pattern.compile(
            "\\b(?:chat|chate|tchat|tchet|chete|charge|xat)\\s+"
                    + "(?:gpt|g\\s+p\\s+t|"
                    + "(?:z|de|g|ge|je|dj|ji)\\s+"
                    + "(?:peter|piter|pete|peti|pe\\s+te|pi\\s+ti))\\b");

    private WakePhraseMatcher() { }

    public static boolean matches(String utterance) {
        if (utterance == null || utterance.isEmpty()) return false;
        String normalized = Normalizer.normalize(utterance, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9\\s]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        normalized = normalized.replace("chatgpt", "chat gpt");
        return PHRASE.matcher(normalized).find();
    }
}