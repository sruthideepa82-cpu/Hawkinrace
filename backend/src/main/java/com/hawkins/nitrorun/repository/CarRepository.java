package com.hawkins.nitrorun.repository;

import java.util.List;
import java.util.Optional;

import com.hawkins.nitrorun.model.Car;

/**
 * Read access to the car catalogue.
 *
 * <p>An interface rather than a concrete class so Phase 5 can introduce a Spring
 * Data JPA repository and have the services keep working untouched: they depend
 * on this contract, never on the storage behind it. The in-memory
 * implementation is seeded from the same data the frontend serves, so
 * {@code GET /api/cars} and the garage screen describe the same cars.
 */
public interface CarRepository {

    List<Car> findAll();

    Optional<Car> findById(String id);

    boolean existsById(String id);
}
