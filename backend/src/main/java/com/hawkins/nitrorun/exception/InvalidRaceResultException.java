package com.hawkins.nitrorun.exception;

/** Thrown when a race result is logically invalid. Maps to HTTP 400. */
public class InvalidRaceResultException extends RuntimeException {

    public InvalidRaceResultException(String message) {
        super(message);
    }
}
