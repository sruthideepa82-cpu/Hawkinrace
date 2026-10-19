package com.hawkins.nitrorun.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.hawkins.nitrorun.dto.HealthResponse;
import com.hawkins.nitrorun.repository.RaceRepository;

/**
 * Reports backend status.
 *
 * <p>Since Phase 5 this reports a real, durable database, so {@code persistent}
 * is now true. That flag flipped only when the storage genuinely became durable,
 * and it is driven by configuration rather than hardcoded, so a misconfigured
 * deployment cannot claim durability it does not have.
 */
@Service
public class HealthService {

    private final RaceRepository races;
    private final String version;
    private final String storage;
    private final boolean persistent;

    public HealthService(RaceRepository races,
                         @Value("${nitrorun.version:0.0.0}") String version,
                         @Value("${nitrorun.storage:unknown}") String storage,
                         @Value("${nitrorun.persistent:false}") boolean persistent) {
        this.races = races;
        this.version = version;
        this.storage = storage;
        this.persistent = persistent;
    }

    public HealthResponse status() {
        return new HealthResponse(
                "UP",
                "nitro-run",
                version,
                storage,
                persistent,
                persistent
                        ? "MySQL-backed storage. Player-submitted races are still NOT authenticated."
                        : "NON-DURABLE storage: data resets on restart. Player-submitted races are NOT authenticated.");
    }

    /** Record count, handy for confirming persistence really did survive. */
    public long raceCount() {
        return races.count();
    }
}