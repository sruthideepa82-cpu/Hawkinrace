package com.hawkins.nitrorun.security;

import java.io.IOException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.hawkins.nitrorun.model.Player;
import com.hawkins.nitrorun.service.AuthService;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Reads {@code Authorization: Bearer <token>} and, if it is a live session,
 * puts that player in the security context.
 *
 * <p>Only ONE authority exists, {@code ROLE_PLAYER}. There is no admin role and
 * no role table: the authorisation model is "you are you", and a second role
 * would be surface with no user.
 *
 * <p>An invalid or absent token is <b>not</b> rejected here. The filter simply
 * leaves the context anonymous and lets the authorisation rules decide, so an
 * unauthenticated request to a public endpoint (the catalogue, the leaderboard)
 * still works. Returning 401 here would break the game's ability to load cars
 * and tracks while signed out.
 */
@Component
public class TokenAuthenticationFilter extends OncePerRequestFilter {

    private static final String PREFIX = "Bearer ";

    private final AuthService auth;

    public TokenAuthenticationFilter(AuthService auth) {
        this.auth = auth;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        // Only do work if something has not already authenticated this request.
        if (SecurityContextHolder.getContext().getAuthentication() == null) {
            String token = bearerToken(request);
            if (token != null) {
                auth.authenticate(token).ifPresent(player -> authenticate(request, player));
            }
        }
        chain.doFilter(request, response);
    }

    private void authenticate(HttpServletRequest request, Player player) {
        // createAuthorityList already returns a List<GrantedAuthority>; wrapping
        // it in List.of would nest a list inside a list and not compile against
        // the constructor's signature.
        var authorities = AuthorityUtils.createAuthorityList("ROLE_PLAYER");
        var authentication = new UsernamePasswordAuthenticationToken(
                player.getId(), null, authorities);
        authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }

    private String bearerToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith(PREFIX)) {
            return null;
        }
        String token = header.substring(PREFIX.length()).trim();
        return token.isEmpty() ? null : token;
    }
}