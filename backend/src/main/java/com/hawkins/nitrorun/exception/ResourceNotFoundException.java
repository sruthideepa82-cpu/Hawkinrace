package com.hawkins.nitrorun.exception;

/** Thrown when a player, car, track or result id does not exist. Maps to HTTP 404. */
public class ResourceNotFoundException extends RuntimeException {

    public ResourceNotFoundException(String message) {
        super(message);
    }
}
