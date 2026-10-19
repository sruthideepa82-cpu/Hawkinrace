package com.hawkins.nitrorun.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.hawkins.nitrorun.dto.CarResponse;
import com.hawkins.nitrorun.service.CarService;

/**
 * Car catalogue.
 *
 * <p>Controllers here are deliberately thin: validate, delegate, return. All
 * decisions (including the 404s) live in the service, so the same behaviour is
 * reachable from tests and from any future non-HTTP entry point.
 */
@RestController
@RequestMapping("/api/cars")
public class CarController {

    private final CarService cars;

    public CarController(CarService cars) {
        this.cars = cars;
    }

    /** {@code GET /api/cars} */
    @GetMapping
    public java.util.List<CarResponse> all() {
        return cars.findAll();
    }

    /** {@code GET /api/cars/{carId}} -- 404 when the id is not in the catalogue. */
    @GetMapping("/{carId}")
    public CarResponse one(@PathVariable String carId) {
        return cars.findById(carId);
    }
}
