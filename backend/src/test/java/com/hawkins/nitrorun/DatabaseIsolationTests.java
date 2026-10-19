package com.hawkins.nitrorun;

import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Fails the build if the test suite is pointed at the development database.
 *
 * <p>This is a canary, and it exists because of a real incident rather than a
 * hypothetical one. During Phase 5 the {@code test} profile was silently absent
 * from {@code ApiTestSupport}, so {@code @SpringBootTest} fell back to the
 * default profile and every test ran against {@code hawkins_nitro_run} &mdash;
 * the schema a developer inspects in Workbench. The suite passed, and left a
 * test player behind in development data.
 *
 * <p>Nothing about a passing suite reveals that. The tests were correct; only
 * the target was wrong. So the target is asserted directly.
 *
 * <p>Deliberately the shortest test in the suite, because it should be the
 * cheapest thing to keep.
 */
class DatabaseIsolationTests extends ApiTestSupport {

    @Test
    @DisplayName("the suite runs against the test schema, never the development one")
    void testsNeverTouchTheDevelopmentDatabase() {
        String url = activeJdbcUrl.toLowerCase();

        assertTrue(url.contains("hawkins_nitro_run_test"),
                "Tests must target hawkins_nitro_run_test, but the datasource URL is: " + activeJdbcUrl);

        // Belt and braces: a URL that merely *mentions* the test schema while
        // pointing elsewhere (a redirect, a replica) is still wrong.
        assertTrue(!url.contains("hawkins_nitro_run?") && !url.contains("hawkins_nitro_run&"),
                "The datasource URL looks like it targets the development schema: " + activeJdbcUrl);
    }
}