package com.hawkins.nitrorun.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.hawkins.nitrorun.dto.HealthResponse;
import com.hawkins.nitrorun.repository.RaceRecordRepository;

/**
 * Reports backend status.
 *
 * <p>The point of this service is the honesty in the response: it states the
 * storage backend and that {@code persistent} is false. A bare
 * {@code 200 OK} from a health check is easy to mistake for "your data is safe",
 * and in Phase 4 it very much is not.
 */
@Service
public class HealthService {

    private final RaceRecordRepository races;
    private final String version;
    private final String storage;

    public HealthService(RaceRecordRepository races,
                         @Value("${nitrorun.version:0.0.0}") String version,
                         @Value("${nitrorun.storage:memory}") String storage) {
        this.races = races;
        this.version = version;
        this.storage = storage;
    }

    public HealthResponse status() {
        return new HealthResponse(
                "UP",
                "nitro-run",
                version,
                storage,
                false,
                "In-memory storage: players and race records reset on restart. "
                        + "Player-submitted races are NOT authenticated.");
    }

    /** Record count, handy for confirming persistence really did reset. */
    public long raceCount() {
        return races.count();
    }
}
