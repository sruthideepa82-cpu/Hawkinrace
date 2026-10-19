package com.hawkins.nitrorun.repository;

/**
 * A player's most recent race, and the car and track it was run on.
 *
 * <p>Spring Data interface projection over a native query.
 */
public interface MostRecentRace {

    String getPlayerId();

    String getCarId();

    String getTrackId();
}