package com.desmond.gptwake;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Experimental recognizer for the shorter phrase "Ei, GPT".
 * Must NOT be used for automatic launch until false-positive testing passes.
 * Vosk's small model can hallucinate "ei z peter" for other speech mentioning GPT.
 */
public final class WakePhraseMatcher {
    private static final Pattern TEST_PHRASE = Pattern.compile(
            "(?:^|\\s)ei\\s+(?:(?:z|de|gente)\\s+)?"
            + "(?:peter|piter|pete|gpt|g\\s+p\\s+t)(?:$|\\s)"
    );

    private WakePhraseMatcher() { }

    public static boolean matches(String utterance) {
        if (utterance == null || utterance.isBlank()) return false;
        String normalized = Normalizer.normalize(utterance, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9\\s]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        return TEST_PHRASE.matcher(normalized).find();
    }
}