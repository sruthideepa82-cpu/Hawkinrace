package com.hawkins.nitrorun.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A raceable track, persisted to {@code tracks}.
 *
 * <p>As with {@link Car}, {@code id} is the frontend's own string id, so
 * Hawkins Town is {@code hawkins-streets} on both sides of the wire rather than
 * being matched by display name.
 */
@Entity
@Table(name = "tracks")
public class Track {

    @Id
    @Column(name = "id", length = 40, nullable = false)
    private String id;

    @Column(name = "name", length = 80, nullable = false, unique = true)
    private String name;

    @Column(name = "description", length = 255)
    private String description;

    /** MEDIUM / HARD / EXTREME, as shown on the selection card. */
    @Column(name = "difficulty", length = 30)
    private String difficulty;

    /** RAIN / FOG / SPORES / CLEAR / STORM. */
    @Column(name = "weather", length = 30)
    private String weather;

    /** TOWN / FOREST / CORRUPTED / MALL / INDUSTRIAL. */
    @Column(name = "environment", length = 40)
    private String environment;

    /** Laps this track is currently configured for. */
    @Column(name = "laps", nullable = false)
    private int laps;

    @Column(name = "locked", nullable = false)
    private boolean locked;

    protected Track() {
    }

    public Track(String id, String name, String description, String difficulty,
                 String weather, String environment, int laps, boolean locked) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.difficulty = difficulty;
        this.weather = weather;
        this.environment = environment;
        this.laps = laps;
        this.locked = locked;
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

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getDifficulty() {
        return difficulty;
    }

    public void setDifficulty(String difficulty) {
        this.difficulty = difficulty;
    }

    public String getWeather() {
        return weather;
    }

    public void setWeather(String weather) {
        this.weather = weather;
    }

    public String getEnvironment() {
        return environment;
    }

    public void setEnvironment(String environment) {
        this.environment = environment;
    }

    public int getLaps() {
        return laps;
    }

    public void setLaps(int laps) {
        this.laps = laps;
    }

    public boolean isLocked() {
        return locked;
    }

    public void setLocked(boolean locked) {
        this.locked = locked;
    }
}