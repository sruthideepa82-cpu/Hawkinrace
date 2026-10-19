package com.hawkins.nitrorun.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A car the player can drive, persisted to {@code cars}.
 *
 * <p>The {@code id} is the same string the frontend uses in
 * {@code src/data/cars.ts}. Both sides keying on the same literal is the point:
 * Phaser tuning, the garage screen and the API all name a car identically, so
 * there is no id translation layer and no chance of the two drifting apart.
 *
 * <p>A mutable JPA entity rather than the Phase 4 record. Entities never leave
 * the service layer -- controllers deal in DTOs, so the persistence model can
 * change without altering the API contract.
 *
 * <p>Attributes are on the game's 1-10 scale and are constrained by CHECK
 * constraints in the schema as well as here.
 */
@Entity
@Table(name = "cars")
public class Car {

    @Id
    @Column(name = "id", length = 40, nullable = false)
    private String id;

    @Column(name = "name", length = 80, nullable = false, unique = true)
    private String name;

    @Column(name = "blurb", length = 160)
    private String blurb;

    /** Paint colour as 0xRRGGBB. Stored UNSIGNED, so any 24-bit value fits. */
    @Column(name = "color", nullable = false)
    private int color;

    @Column(name = "speed", nullable = false)
    private int speed;

    @Column(name = "acceleration", nullable = false)
    private int acceleration;

    @Column(name = "handling", nullable = false)
    private int handling;

    @Column(name = "nitro", nullable = false)
    private int nitro;

    @Column(name = "unlocked", nullable = false)
    private boolean unlocked;

    /** For JPA and Hibernate's proxying. Not for application code. */
    protected Car() {
    }

    public Car(String id, String name, String blurb, int color,
               int speed, int acceleration, int handling, int nitro, boolean unlocked) {
        this.id = id;
        this.name = name;
        this.blurb = blurb;
        this.color = color;
        this.speed = speed;
        this.acceleration = acceleration;
        this.handling = handling;
        this.nitro = nitro;
        this.unlocked = unlocked;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getBlurb() {
        return blurb;
    }

    public void setBlurb(String blurb) {
        this.blurb = blurb;
    }

    public int getColor() {
        return color;
    }

    public void setColor(int color) {
        this.color = color;
    }

    public int getSpeed() {
        return speed;
    }

    public void setSpeed(int speed) {
        this.speed = speed;
    }

    public int getAcceleration() {
        return acceleration;
    }

    public void setAcceleration(int acceleration) {
        this.acceleration = acceleration;
    }

    public int getHandling() {
        return handling;
    }

    public void setHandling(int handling) {
        this.handling = handling;
    }

    public int getNitro() {
        return nitro;
    }

    public void setNitro(int nitro) {
        this.nitro = nitro;
    }

    public boolean isUnlocked() {
        return unlocked;
    }

    public void setUnlocked(boolean unlocked) {
        this.unlocked = unlocked;
    }
}