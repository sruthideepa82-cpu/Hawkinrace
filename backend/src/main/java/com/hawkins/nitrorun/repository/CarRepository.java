package com.hawkins.nitrorun.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.hawkins.nitrorun.model.Car;

/**
 * Car catalogue.
 *
 * <p>Seeded idempotently at startup, so the application always serves the same
 * cars the game defines in {@code src/data/cars.ts}.
 */
public interface CarRepository extends JpaRepository<Car, String> {
}