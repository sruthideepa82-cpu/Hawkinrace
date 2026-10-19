package com.hawkins.nitrorun.model;

/**
 * A car the player can drive.
 *
 * The {@code id} is the same string the frontend uses in
 * {@code frontend/src/data/cars.ts}. Both sides keying on the same literal is
 * deliberate: the game's Phaser tuning, the garage screen and the API all refer
 * to a car the same way, so there is no id translation layer and no chance of
 * the two drifting apart.
 *
 * <p>Attributes are on the frontend's 1-10 scale, so a value here means the same
 * thing it does on the selection screen.
 *
 * <p>Purely a domain type: no persistence annotations. Phase 4 stores these in
 * memory and Phase 5 will add the mapping separately.
 */
public record Car(
        String id,
        String name,
        String blurb,
        /** Paint colour as 0xRRGGBB, matching the frontend. */
        int color,
        int speed,
        int acceleration,
        int handling,
        int nitro,
        boolean unlocked) {
}
