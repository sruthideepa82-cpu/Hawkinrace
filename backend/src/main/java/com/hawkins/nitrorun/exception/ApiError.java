package com.hawkins.nitrorun.exception;

import java.time.Instant;
import java.util.Map;

/**
 * Uniform error body. Never carries stack traces or exception internals.
 */
public record ApiError(
        Instant timestamp,
        int status,
        String error,
        String message,
        String path,
        Map<String, String> fieldErrors) {

    public static ApiError of(int status, String error, String message, String path) {
        return new ApiError(Instant.now(), status, error, message, path, null);
    }

    public static ApiError ofFields(int status, String error, String message, String path,
                                    Map<String, String> fieldErrors) {
        return new ApiError(Instant.now(), status, error, message, path, fieldErrors);
    }
}
