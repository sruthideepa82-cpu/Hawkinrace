package com.hawkins.nitrorun.service;

import java.util.List;
import java.util.Locale;

import org.springframework.stereotype.Service;

import com.hawkins.nitrorun.dto.CarResponse;
import com.hawkins.nitrorun.exception.ResourceNotFoundException;
import com.hawkins.nitrorun.model.Car;
import com.hawkins.nitrorun.repository.CarRepository;

/** Reads the car catalogue. */
@Service
public class CarService {

    private final CarRepository cars;

    public CarService(CarRepository cars) {
        this.cars = cars;
    }

    public List<CarResponse> findAll() {
        return cars.findAll().stream().map(CarResponse::from).toList();
    }

    /**
     * @throws ResourceNotFoundException if no car has that id. 404 rather than
     *         400: a well-formed id that is not in the catalogue is a missing
     *         resource, not a malformed request.
     */
    public CarResponse findById(String id) {
        Car car = cars.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("No car with id '" + id + "'"));
        return CarResponse.from(car);
    }

    /** True when the id is a real car. Used to validate a submitted race. */
    public boolean exists(String id) {
        return id != null && cars.existsById(id.toLowerCase(Locale.ROOT));
    }
}
