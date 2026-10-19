package com.hawkins.nitrorun.exception;

/** Thrown when creating something that already exists (e.g. username). Maps to HTTP 409. */
public class DuplicateResourceException extends RuntimeException {

    public DuplicateResourceException(String message) {
        super(message);
    }
}
