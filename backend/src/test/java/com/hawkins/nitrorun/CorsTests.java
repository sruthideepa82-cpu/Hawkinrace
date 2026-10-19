package com.hawkins.nitrorun;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The CORS contract, as a test.
 *
 * <p>This exists because of a real regression. Phase 7 added Spring Security, and
 * security silently took over the {@code OPTIONS} preflight: it was evaluated by
 * {@code anyRequest().denyAll()} and refused with 401 <em>before</em> the servlet's
 * CORS handling could add {@code Access-Control-Allow-Origin}. Every browser
 * request then failed — including requests to the public catalogue — while curl
 * and the test suite carried on passing, because neither issues a preflight.
 *
 * <p>The failure was only caught by {@code scripts/e2e-fullstack.ps1}, which sends
 * a real preflight. That is too late. These assertions run in the ordinary suite
 * so the regression cannot come back unnoticed.
 */
@SpringBootTest(properties = "nitrorun.cors.allowed-origins=http://localhost:5173")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CorsTests {

    private static final String ORIGIN = "http://localhost:5173";

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("a preflight for a public endpoint is answered, not refused")
    void preflightForPublicEndpointIsAllowed() throws Exception {
        // The exact failure: 401 with no Access-Control-Allow-Origin means no
        // browser on earth can read this API.
        mockMvc.perform(options("/api/cars")
                        .header(HttpHeaders.ORIGIN, ORIGIN)
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, ORIGIN));
    }

    @Test
    @DisplayName("a preflight for an authenticated endpoint is answered too")
    void preflightForProtectedEndpointIsAllowed() throws Exception {
        // Preflight carries no credentials by design, so it cannot be asked "who are
        // you?" -- but it must still succeed, or the real request is never attempted.
        mockMvc.perform(options("/api/races")
                        .header(HttpHeaders.ORIGIN, ORIGIN)
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS,
                                "content-type,authorization"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, ORIGIN));
    }

    @Test
    @DisplayName("Authorization is a permitted request header")
    void authorizationIsAllowedAsARequestHeader() throws Exception {
        // Authorization is not CORS-safelisted. If the preflight does not advertise
        // it, every authenticated call is blocked in the browser while working
        // perfectly from curl -- a silent, total client-side failure.
        String allowHeaders = mockMvc.perform(options("/api/races")
                        .header(HttpHeaders.ORIGIN, ORIGIN)
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "authorization"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS);

        assertThat(allowHeaders).isNotNull();
        assertThat(allowHeaders.toLowerCase()).contains("authorization");
    }

    @Test
    @DisplayName("an actual cross-origin response carries the allow header")
    void actualRequestCarriesTheAllowHeader() throws Exception {
        mockMvc.perform(get("/api/cars").header(HttpHeaders.ORIGIN, ORIGIN))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, ORIGIN));
    }

    @Test
    @DisplayName("an unknown origin is not granted access")
    void unknownOriginIsNotAllowed() throws Exception {
        // The other half of the contract: the API is not open to every site.
        var result = mockMvc.perform(get("/api/cars")
                        .header(HttpHeaders.ORIGIN, "https://evil.example.com"))
                .andReturn();

        String allowOrigin = result.getResponse().getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN);
        // The request may still succeed (CORS is a browser-side control), but the
        // browser must not be told to share the response with that origin.
        assertThat(allowOrigin).isNull();
    }

    @Test
    @DisplayName("credentials mode stays off, since auth is a bearer token")
    void credentialsAreNotAllowed() throws Exception {
        // The API authenticates by header, not cookie. allowCredentials=true would
        // force the origin list to stay wildcard-free forever, for no benefit.
        String allowCredentials = mockMvc.perform(get("/api/cars")
                        .header(HttpHeaders.ORIGIN, ORIGIN))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS);

        assertThat(allowCredentials).isNotEqualTo("true");
    }

    @Test
    @DisplayName("CORS does not weaken authentication")
    void corsDoesNotOpenUpProtectedData() throws Exception {
        // Being cross-origin-readable is not the same as being public. A preflight
        // is answered; the data behind it still requires a token.
        mockMvc.perform(post("/api/races")
                        .header(HttpHeaders.ORIGIN, ORIGIN)
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isUnauthorized());
    }
}