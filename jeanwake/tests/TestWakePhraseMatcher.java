package com.desmond.gptwake;

public class TestWakePhraseMatcher {
    private static int failures = 0;
    private static int checks = 0;
    private static void check(String phrase, boolean expected) {
        checks++;
        boolean actual = WakePhraseMatcher.matches(phrase);
        if (actual != expected) {
            failures++;
            System.err.println("FAIL expected=" + expected + " phrase=" + phrase);
        }
    }
    public static void main(String[] args) {
        check("Ei, GPT!", true);
        check("ei gpt", true);
        check("ei z peter", true);
        check("[unk] ei z peter", true);
        check("ei de peter", true);
        check("ei gente peter", true);
        check("ei peter", true);
        check("Ei G P T", true);
        check("ei piter", true);
        check("ei pete", true);
        check("peter", false);
        check("z peter", false);
        check("oi gente peter", false);
        check("oi chat gpt", false);
        check("ei, chat gpt", false);
        check("gpt", false);
        check("eu gostei do gpt", false);
        check("vamos falar com o peter", false);
        check("ei gente", false);
        check("ei, tudo bem?", false);
        if (failures != 0) {
            System.err.println("TEST_FAILURES: " + failures + " of " + checks);
            System.exit(1);
        }
        System.out.println("WAKE_MATCHER_TESTS_PASSED: " + checks);
    }
}