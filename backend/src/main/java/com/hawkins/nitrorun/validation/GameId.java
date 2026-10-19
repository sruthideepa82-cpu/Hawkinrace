package com.hawkins.nitrorun.validation;

/**
 * The shape of a game identifier (a car or track id).
 *
 * <p>Not enforced as a bean-constraint on its own -- an unknown-but-well-formed id
 * is a 404, not a 400 -- but kept here so the pattern is stated in one place and
 * reused by the services when they check a submitted race.
 *
 * <p>Matching it matters for the 404 path: rejecting {@code ../etc/passwd} or a
 * 2KB string before it reaches a lookup is cheap defence in depth, even though
 * a map lookup would have been harmless.
 */
public final class GameId {

    /** Lower-case kebab-case, 1 to 40 characters. */
    private static final java.util.regex.Pattern PATTERN =
            java.util.regex.Pattern.compile("^[a-z0-9]+(?:-[a-z0-9]+)*$");

    private static final int MAX_LENGTH = 40;

    private GameId() {
    }

    public static boolean isWellFormed(String value) {
        return value != null && value.length() <= MAX_LENGTH && PATTERN.matcher(value).matches();
    }
}
