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
 * A player profile, persisted to {@code players}.
 *
 * <p><b>This is not an account.</b> There is no credential column, by design:
 * authentication belongs to a later security phase, and adding a password
 * column now would imply a protection that does not exist. Whoever sends a
 * valid request is trusted.
 *
 * <p>The consequence is that every race attributed to this profile is
 * self-reported and unverified. See {@code Race}.
 *
 * <p>{@code displayName} carries a UNIQUE constraint. In Phase 4 that rule was
 * enforced only by a service-level check; it is now a database constraint too,
 * so a race between two concurrent requests cannot create two players with the
 * same name.
 */
@Entity
@Table(name = "players")
public class Player {

    @Id
    @Column(name = "id", length = 24, nullable = false)
    private String id;

    @Column(name = "display_name", length = 24, nullable = false, unique = true)
    private String displayName;

    /**
     * The car this profile last selected, or null before they pick one.
     *
     * <p>LAZY on purpose. Reading {@code getId()} off a lazy proxy is served
     * from the proxy's own identifier and never issues a query, so mapping a
     * page of players to DTOs costs no extra round trips. SET NULL at the
     * database level means retiring a car from the catalogue cannot cascade
     * into player rows.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "selected_car_id")
    private Car selectedCar;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    protected Player() {
    }

    public Player(String id, String displayName, Car selectedCar, Instant createdAt) {
        this.id = id;
        this.displayName = displayName;
        this.selectedCar = selectedCar;
        this.createdAt = createdAt;
    }

    public String getId() {
        return id;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public Car getSelectedCar() {
        return selectedCar;
    }

    public void setSelectedCar(Car selectedCar) {
        this.selectedCar = selectedCar;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}