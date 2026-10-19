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
 * <p><b>Phase 7 added credentials.</b> {@code passwordHash} is a BCrypt hash and
 * is never returned by any DTO. Before that this class deliberately had no
 * credential column, which meant any caller could read every profile and submit
 * a race for any player id.
 *
 * <p>Being signed in proves <em>which</em> player is making a request. It does
 * not make their race times true: the game is single-player and offline, so the
 * client still reports the times it drove. Authentication closes the door on
 * other people's accounts; it does not make a leaderboard cheat-proof. See
 * {@code Race}.
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
     * BCrypt hash of the player's password, or null for an account created
     * before Phase 7.
     *
     * <p>Never leaves the persistence layer: no DTO, no response body and no log
     * statement reads this.
     */
    @Column(name = "password_hash", length = 100)
    private String passwordHash;

    /**
     * True when this profile can sign in.
     *
     * <p>A null hash means a legacy account with no password. It is reported as
     * such rather than failing with a confusing "invalid password".
     */
    public boolean hasPassword() {
        return passwordHash != null && !passwordHash.isBlank();
    }

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
        this(id, displayName, null, selectedCar, createdAt);
    }

    public Player(String id, String displayName, String passwordHash, Car selectedCar, Instant createdAt) {
        this.id = id;
        this.displayName = displayName;
        this.passwordHash = passwordHash;
        this.selectedCar = selectedCar;
        this.createdAt = createdAt;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
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