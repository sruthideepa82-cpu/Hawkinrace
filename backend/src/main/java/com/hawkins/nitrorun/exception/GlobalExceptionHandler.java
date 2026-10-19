package com.hawkins.nitrorun.exception;

import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;

/**
 * Turns every exception into one JSON shape ({@link ApiError}) with a sensible
 * status code.
 *
 * <p>The contract this class exists to keep: a client never receives a stack
 * trace, a class name, or an internal message. Unhandled causes are logged in
 * full for developers and replaced with a generic body on the way out. The
 * container is configured the same way -- `server.error.include-stacktrace:
 * never` -- so the framework cannot leak one through a path this advice misses.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** 404: a player, car, track or race id that does not exist. */
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiError> handleNotFound(ResourceNotFoundException ex, HttpServletRequest request) {
        return build(HttpStatus.NOT_FOUND, ex.getMessage(), request);
    }

    /** 400: a race result that parses but is not logically possible. */
    @ExceptionHandler(InvalidRaceResultException.class)
    public ResponseEntity<ApiError> handleInvalidRace(InvalidRaceResultException ex, HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, ex.getMessage(), request);
    }

    /** 409: creating something that already exists. */
    @ExceptionHandler(DuplicateResourceException.class)
    public ResponseEntity<ApiError> handleDuplicate(DuplicateResourceException ex, HttpServletRequest request) {
        return build(HttpStatus.CONFLICT, ex.getMessage(), request);
    }

    /** 400: a JSON body failed field validation. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleBodyValidation(MethodArgumentNotValidException ex,
                                                          HttpServletRequest request) {
        Map<String, String> fields = new LinkedHashMap<>();
        ex.getBindingResult().getFieldErrors()
                .forEach(err -> fields.putIfAbsent(err.getField(), err.getDefaultMessage()));

        return ResponseEntity.badRequest().body(ApiError.ofFields(
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                "Validation failed",
                request.getRequestURI(),
                fields));
    }

    /**
     * 400: a path variable or query parameter failed validation.
     *
     * <p>Separate from the body case because it raises a different Spring
     * exception, and without this it would fall through to the catch-all and be
     * reported as a 500 -- a client sending a bad page size would be told the
     * server broke.
     */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiError> handleParameterValidation(ConstraintViolationException ex,
                                                               HttpServletRequest request) {
        Map<String, String> fields = new LinkedHashMap<>();
        for (ConstraintViolation<?> violation : ex.getConstraintViolations()) {
            fields.putIfAbsent(String.valueOf(violation.getPropertyPath()), violation.getMessage());
        }
        return ResponseEntity.badRequest().body(ApiError.ofFields(
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                "Validation failed",
                request.getRequestURI(),
                fields));
    }

    /**
     * 400: the body was not JSON, or a field had the wrong JSON type.
     *
     * <p>The underlying Jackson message can quote the offending value, which may
     * be a large payload, so it is deliberately not passed through. The client
     * gets the shape of the problem without the content.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> handleUnreadableBody(HttpMessageNotReadableException ex,
                                                          HttpServletRequest request) {
        log.debug("Unreadable request body on {}", request.getRequestURI(), ex);
        return build(HttpStatus.BAD_REQUEST, "Malformed request body", request);
    }

    /** 400: a path or query value could not be converted to the declared type. */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiError> handleTypeMismatch(MethodArgumentTypeMismatchException ex,
                                                       HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST,
                "Parameter '" + ex.getName() + "' has the wrong format",
                request);
    }

    /** 405: a known path with the wrong HTTP verb. */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiError> handleMethodNotSupported(HttpRequestMethodNotSupportedException ex,
                                                              HttpServletRequest request) {
        return build(HttpStatus.METHOD_NOT_ALLOWED, ex.getMessage(), request);
    }

    /** 404: no handler at all, e.g. an unknown URL under the API prefix. */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiError> handleNoResource(NoResourceFoundException ex,
                                                      HttpServletRequest request) {
        return build(HttpStatus.NOT_FOUND, "No endpoint " + request.getMethod() + " " + request.getRequestURI(),
                request);
    }

    /**
     * 500: anything unforeseen.
     *
     * <p>Logged with the real cause; answered with a fixed sentence. This is the
     * only place that can leak internals, and it deliberately does not.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnexpected(Exception ex, HttpServletRequest request) {
        log.error("Unhandled error on {} {}", request.getMethod(), request.getRequestURI(), ex);
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "Internal server error", request);
    }

    private ResponseEntity<ApiError> build(HttpStatus status, String message, HttpServletRequest request) {
        return ResponseEntity.status(status)
                .body(ApiError.of(status.value(), status.getReasonPhrase(), message, request.getRequestURI()));
    }
}