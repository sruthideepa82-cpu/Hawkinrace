package com.hawkins.nitrorun.model;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * One completed race, persisted to {@code races}.
 *
 * <p><b>Client-reported and unverified.</b> The browser asserts that it drove
 * the race and how long it took; nothing here checks it. That is inherent to
 * the game being single-player and offline, and it is why Phase 5 does not add
 * an accounts table: authenticating the submitter would not authenticate the
 * time.
 *
 * <p>Every relation is LAZY, and only ever read through {@code getId()} when
 * building a response. Hibernate answers that from the proxy without a query,
 * so listing a player's history stays a single SELECT rather than one per row.
 *
 * <p>The schema also carries a {@code seq AUTO_INCREMENT} column used to
 * break {@code completedAt} ties when ordering history. It is mapped read-only
 * so a derived ORDER BY can reach it, and excluded from every write.
 *
 * <p>There is no participants table. The opponents are AI simulated locally in
 * Phaser and never reach the server.
 */
@Entity
@Table(name = "races")
public class Race {

    @Id
    @Column(name = "id", length = 24, nullable = false)
    private String id;

    /**
     * Monotonic insertion sequence, used only to break {@code completedAt}
     * ties when ordering history.
     *
     * <p>Mapped read-only. The database assigns it, so it is excluded from
     * INSERT and UPDATE -- no application write can forge an ordering. It is
     * read on SELECT, which is what lets Spring Data derive the
     * {@code ...OrderByCompletedAtDescSeqDesc} history query.
     *
     * <p>It is null on an instance straight after {@code save()}, because
     * Hibernate does not refresh generated columns. Nothing in Java reads it.
     */
    @Column(name = "seq", insertable = false, updatable = false)
    private Long seq;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "player_id", nullable = false)
    private Player player;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "car_id", nullable = false)
    private Car car;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "track_id", nullable = false)
    private Track track;

    /** Finishing position, 1-based. */
    @Column(name = "finishing_position", nullable = false)
    private int finishingPosition;

    @Column(name = "laps_completed", nullable = false)
    private int lapsCompleted;

    /**
     * Laps the track was configured for when this race was recorded.
     *
     * <p>Copied rather than looked up, so a past result keeps the distance it
     * was actually set over even if the track is later reconfigured.
     */
    @Column(name = "total_laps", nullable = false)
    private int totalLaps;

    @Column(name = "elapsed_time_ms", nullable = false)
    private long elapsedTimeMs;

    @Column(name = "best_lap_time_ms")
    private Long bestLapTimeMs;

    @Column(name = "completed_at", nullable = false)
    private Instant completedAt;

    protected Race() {
    }

    public Race(String id, Player player, Car car, Track track,
                int finishingPosition, int lapsCompleted, int totalLaps,
                long elapsedTimeMs, Long bestLapTimeMs, Instant completedAt) {
        this.id = id;
        this.player = player;
        this.car = car;
        this.track = track;
        this.finishingPosition = finishingPosition;
        this.lapsCompleted = lapsCompleted;
        this.totalLaps = totalLaps;
        this.elapsedTimeMs = elapsedTimeMs;
        this.bestLapTimeMs = bestLapTimeMs;
        this.completedAt = completedAt;
    }

    public String getId() {
        return id;
    }

    public Player getPlayer() {
        return player;
    }

    public Car getCar() {
        return car;
    }

    public Track getTrack() {
        return track;
    }

    public int getFinishingPosition() {
        return finishingPosition;
    }

    public int getLapsCompleted() {
        return lapsCompleted;
    }

    public int getTotalLaps() {
        return totalLaps;
    }

    public long getElapsedTimeMs() {
        return elapsedTimeMs;
    }

    public Long getBestLapTimeMs() {
        return bestLapTimeMs;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }
}