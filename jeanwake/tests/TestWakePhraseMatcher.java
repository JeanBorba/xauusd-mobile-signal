package com.desmond.gptwake;

public class TestWakePhraseMatcher {
    private static int failures;

    private static void check(String phrase, boolean expected) {
        boolean actual = WakePhraseMatcher.matches(phrase);
        if (actual != expected) {
            failures++;
            System.err.println("FAIL expected=" + expected + " phrase=" + phrase);
        }
    }

    public static void main(String[] args) {
        check("chat z peter", true);
        check("charge z peter", true);
        check("oi chat z peter", true);
        check("chat de peter", true);
        check("Ei, ChatGPT!", true);
        check("ei chat g p t", true);
        check("chát gê pê tê", true);
        check("oi chat vamos conversar", false);
        check("oi pessoal", false);
        check("chat", false);
        check("peter", false);
        check("chat peter", false);
        check("o debate do peter no chat", false);
        check("oi, quero falar com o chat", false);
        if (failures != 0) {
            System.err.println("FAILED: " + failures);
            System.exit(1);
        }
        System.out.println("WAKE_MATCHER_TESTS_PASSED: 14");
    }
}